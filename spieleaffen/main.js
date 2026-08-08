/* SpieleAffen — main.js: Read-only-Hauptseite.
 * Alles wird aus den Daten berechnet; hier gibt es keinerlei Schreibpfad —
 * Änderungen laufen ausschließlich über edit.html mit persönlichem Token. */
(function () {
  'use strict';
  var SA = window.SA, UI = window.SA_UI, API = window.SA_API;
  var esc = UI.esc;

  var state = {
    loaded: null,       // {data, rev, updatedAt, source}
    computed: null,
    scope: 'season',    // 'season' | 'all' | 'games'
    seasonId: null,
    todayIso: new Date().toISOString().slice(0, 10)
  };

  var $view = document.getElementById('view');

  // ── Routing (#tabelle, #abende, #pokale, #spieler, #spieler/<id>) ──
  function route() {
    var h = (location.hash || '#tabelle').slice(1);
    var parts = h.split('/');
    return { view: parts[0] || 'tabelle', arg: parts[1] || null };
  }
  window.addEventListener('hashchange', render);

  // ── Daten laden ──
  API.loadData().then(function (res) {
    state.loaded = res;
    state.computed = SA.compute(res.data);
    var cur = SA.currentSeason(res.data, state.todayIso);
    state.seasonId = cur ? cur.id : null;
    render();
  }).catch(function (err) {
    $view.innerHTML = '<div class="gate"><div class="logo">SPIELE<em>AFFEN</em></div>' +
      '<p>Daten konnten nicht geladen werden: ' + esc(err.message) + '</p></div>';
  });

  function seasonById(id) {
    return (state.computed.seasons || []).filter(function (s) { return s.id === id; })[0] || null;
  }

  function weeksLeft(season) {
    if (!season) return null;
    var end = new Date(season.end + 'T23:59:59');
    var diff = Math.ceil((end - new Date()) / (7 * 24 * 3600 * 1000));
    return diff >= 0 ? diff : null;
  }

  function playerName(pid) {
    var p = state.computed.playerById[pid];
    return p ? p.name : pid;
  }

  // ── Kopf + Chips ──
  function headHtml(title, season) {
    var c = state.computed;
    var metaHtml = '';
    if (season && state.scope === 'season') {
      var st = c.spieltag(season.id);
      var wl = weeksLeft(season);
      metaHtml = 'Spieltag ' + st + (wl !== null ? '<br>noch ' + wl + ' Woche' + (wl === 1 ? '' : 'n') : '');
    } else if (state.scope === 'all') {
      metaHtml = c.playedNights.length + ' Abende<br>seit ' + (c.playedNights.length ? SA.fmtDate(c.playedNights[0].date) : '—');
    }
    var eyebrow = state.scope === 'season' && season ? season.name
      : state.scope === 'all' ? 'Ewige Tabelle' : 'Pro Spiel';
    return '<div class="view-head">' +
      '<div><div class="eyebrow acid">' + esc(eyebrow) + '</div>' +
      '<h1 class="h-display">' + esc(title) + '</h1></div>' +
      '<div class="meta">' + metaHtml + '</div>' +
    '</div>';
  }

  function chipsHtml() {
    var c = state.computed;
    var html = '<div class="chips">' +
      '<button class="chip' + (state.scope === 'season' ? ' on' : '') + '" data-scope="season">Saison</button>' +
      '<button class="chip' + (state.scope === 'all' ? ' on' : '') + '" data-scope="all">Ewig</button>' +
      '<button class="chip' + (state.scope === 'games' ? ' on' : '') + '" data-scope="games">Pro Spiel</button>' +
    '</div>';
    if (state.scope === 'season' && c.seasons.length > 1) {
      html += '<div class="chips" style="margin-top:-8px">' + c.seasons.map(function (s) {
        return '<button class="chip small' + (s.id === state.seasonId ? ' on' : '') + '" data-season="' + esc(s.id) + '">' + esc(s.name.replace(/ ·.*$/, '')) + '</button>';
      }).join('') + '</div>';
    }
    return html;
  }

  function bindChips(root) {
    root.querySelectorAll('[data-scope]').forEach(function (b) {
      b.addEventListener('click', function () { state.scope = b.dataset.scope; render(); });
    });
    root.querySelectorAll('[data-season]').forEach(function (b) {
      b.addEventListener('click', function () { state.seasonId = b.dataset.season; render(); });
    });
  }

  // ── Tabelle ──
  function tableHtml(rows, statusMap) {
    if (!rows.length) {
      return '<div class="sect"><div class="card lg" style="text-align:center;color:var(--mute);font:400 12px/1.6 var(--sys)">Noch keine Abende in diesem Zeitraum.</div></div>';
    }
    var lastPlace = rows[rows.length - 1].place;
    return '<div class="tbl-cols"><div>#</div><div>Spieler</div><div class="r">Sp</div><div class="r">S</div><div class="r">Pkt</div></div>' +
      '<div class="tbl">' + rows.map(function (r) {
        var pid = r.player.id;
        var st = statusMap[pid];
        var cls = r.place === 1 ? ' lead' : (st && st.tone === 'down' && r.place === lastPlace ? ' lantern' : '');
        var sub = st ? '<div class="sub ' + (st.tone === 'up' ? 'up' : st.tone === 'down' ? 'down' : '') + '">' + esc(st.text) + '</div>' : '';
        return '<a class="trow' + cls + '" href="#spieler/' + esc(pid) + '">' +
          '<div class="place">' + r.place + '</div>' +
          '<div class="who">' + UI.avatar(r.player, { acid: r.place === 1 }) +
            '<div style="min-width:0"><div class="nm">' + esc(r.player.name) + '</div>' + sub + '</div></div>' +
          '<div class="c">' + r.stats.nights + '</div>' +
          '<div class="c">' + r.stats.nightWins + '</div>' +
          '<div class="pts">' + r.stats.points + '</div>' +
        '</a>';
      }).join('') + '</div>' +
      '<div class="legend">Punkte je Spiel: 1./2./3. = ' + SA.PLACE_POINTS.join('/') + ' · Antreten +' + SA.PART_POINTS + ' pro Abend · Bester Tipp +' + SA.TIP_BONUS + '</div>';
  }

  function perGameHtml() {
    var c = state.computed;
    var titles = Object.keys(c.perGame).sort(function (a, b) {
      return c.perGame[b].plays - c.perGame[a].plays || a.localeCompare(b, 'de');
    });
    if (!titles.length) return '<div class="sect"><div class="card lg" style="color:var(--mute)">Noch keine Spiele erfasst.</div></div>';
    return '<div class="sect" style="gap:10px">' + titles.map(function (t) {
      var pg = c.perGame[t];
      var rows = Object.keys(pg.byPlayer).map(function (pid) {
        var bp = pg.byPlayer[pid];
        var placeSum = bp.places.reduce(function (a, b) { return a + b; }, 0);
        return { pid: pid, bp: bp, avg: placeSum / bp.places.length };
      });
      rows.sort(function (a, b) { return b.bp.wins - a.bp.wins || a.avg - b.avg; });
      var best = rows[0];
      var rec = c.records.bestScoreByTitle[t];
      return '<details class="night-item">' +
        '<summary>' +
          '<div class="info"><div class="t">' + esc(t) + '</div>' +
            '<div class="s">' + pg.plays + '× gespielt' + (rec ? ' · Rekord ' + rec.score + ' (' + esc(playerName(rec.playerId)) + ')' : '') + '</div></div>' +
          '<div class="win"><div class="n">' + esc(playerName(best.pid)) + '</div><div class="k">' + best.bp.wins + ' SIEGE</div></div>' +
        '</summary>' +
        '<div class="night-body"><div class="game-block"><div class="reslist">' +
          rows.map(function (r, i) {
            return '<div class="resrow' + (i === 0 ? ' first' : '') + '">' +
              '<div class="p">' + (i + 1) + '</div>' +
              '<div class="n">' + esc(playerName(r.pid)) + '</div>' +
              '<div class="tip">Ø PLATZ ' + r.avg.toFixed(1) + '</div>' +
              '<div class="sc">' + r.bp.wins + ' S</div>' +
            '</div>';
          }).join('') +
        '</div></div></div>' +
      '</details>';
    }).join('') + '</div>';
  }

  function nextNightHtml() {
    var c = state.computed;
    var future = c.plannedNights.filter(function (n) { return n.date >= state.todayIso; });
    if (!future.length) return '';
    var n = future[0];
    var host = n.hostId ? c.playerById[n.hostId] : null;
    var yes = (n.yes || []).length;
    var yesCodes = (n.yes || []).map(function (pid) { return esc(SA.shortCode(c.playerById[pid])); }).join(' · ');
    return '<div class="sect" style="padding-top:2px">' +
      '<div class="sect-head"><div class="eyebrow">Nächster Abend</div>' +
        (yes ? '<div class="sect-link">' + yes + ' zugesagt</div>' : '') + '</div>' +
      '<div class="card next-night">' +
        '<div class="date"><div class="d">' + SA.dayNum(n.date) + '</div><div class="m">' + esc(SA.monthAbbr(n.date)) + '</div></div>' +
        '<div class="sep"></div>' +
        '<div class="info"><div class="t">' + (host ? 'Bei ' + esc(host.name) : 'Spieleabend') + (n.time ? ' · ' + esc(n.time) : '') + '</div>' +
          (n.plannedGames ? '<div class="s">' + esc(n.plannedGames) + '</div>' : '') +
          (yes ? '<div class="s" style="color:var(--acid)">' + yesCodes + '</div>' : '') + '</div>' +
      '</div>' +
    '</div>';
  }

  function lastNightHtml() {
    var c = state.computed;
    if (!c.nightInfos.length) return '';
    var info = c.nightInfos[c.nightInfos.length - 1];
    return '<div class="sect">' +
      '<div class="sect-head"><div class="eyebrow">Letzter Abend · ' + esc(SA.fmtDateShort(info.night.date)) + '</div>' +
      '<a class="sect-link" href="#abende">Alle Abende</a></div>' +
      UI.nightDetails(c, info, {}) +
    '</div>';
  }

  function renderTabelle() {
    var c = state.computed;
    var season = seasonById(state.seasonId);
    var html;
    if (state.scope === 'games') {
      html = headHtml('Spiele', season) + chipsHtml() + perGameHtml();
    } else {
      var rows = c.table(state.scope === 'all' ? 'all' : (season ? season.id : 'all'));
      var status = SA.statusLines(c, rows);
      html = headHtml('Tabelle', season) + chipsHtml() + tableHtml(rows, status) +
        '<div class="hr"></div>' + nextNightHtml() + lastNightHtml();
    }
    $view.innerHTML = html;
    bindChips($view);
  }

  // ── Abende ──
  function renderAbende() {
    var c = state.computed;
    var html = '<div class="view-head"><div><div class="eyebrow acid">Alle Abende</div>' +
      '<h1 class="h-display">Abende</h1></div>' +
      '<div class="meta">' + c.playedNights.length + ' gespielt</div></div>';

    var future = c.plannedNights.filter(function (n) { return n.date >= state.todayIso; });
    if (future.length) {
      html += '<div class="sect" style="padding-bottom:18px"><div class="eyebrow">Geplant</div>' +
        future.map(function (n) {
          var host = n.hostId ? c.playerById[n.hostId] : null;
          return '<div class="card next-night">' +
            '<div class="date"><div class="d">' + SA.dayNum(n.date) + '</div><div class="m">' + esc(SA.monthAbbr(n.date)) + '</div></div>' +
            '<div class="sep"></div>' +
            '<div class="info"><div class="t">' + (host ? 'Bei ' + esc(host.name) : 'Spieleabend') + (n.time ? ' · ' + esc(n.time) : '') + '</div>' +
            (n.plannedGames ? '<div class="s">' + esc(n.plannedGames) + '</div>' : '') + '</div>' +
            ((n.yes || []).length ? '<div class="pill ghost">' + (n.yes || []).length + ' zugesagt</div>' : '') +
          '</div>';
        }).join('') + '</div>';
    }

    var bySeason = {};
    c.nightInfos.slice().reverse().forEach(function (info) {
      var sid = info.season ? info.season.id : '_none';
      if (!bySeason[sid]) bySeason[sid] = { season: info.season, infos: [] };
      bySeason[sid].infos.push(info);
    });
    var seasonIds = Object.keys(bySeason);
    seasonIds.forEach(function (sid, idx) {
      var grp = bySeason[sid];
      html += '<div class="season-divider"><div class="eyebrow">' + esc(grp.season ? grp.season.name : 'Ohne Saison') + '</div></div>' +
        '<div class="sect" style="gap:10px">' +
        grp.infos.map(function (info, i) {
          return UI.nightDetails(c, info, { open: idx === 0 && i === 0 });
        }).join('') + '</div>';
    });
    $view.innerHTML = html;
  }

  // ── Pokale ──
  function renderPokale() {
    var c = state.computed;
    var defs = {};
    c.achievements.forEach(function (a) { defs[a.id] = a; });

    var unlockedTotal = c.unlockEvents.length;
    var html = '<div class="view-head"><div><div class="eyebrow acid">Achievements &amp; Rekorde</div>' +
      '<h1 class="h-display">Pokale</h1></div>' +
      '<div class="meta">' + unlockedTotal + ' freigeschaltet</div></div>';

    // Frisch freigeschaltet (je Pokal nur der neueste Eintrag)
    var seen = {};
    var fresh = c.unlockEvents.filter(function (e) {
      if (seen[e.achId]) return false;
      seen[e.achId] = true;
      return true;
    }).slice(0, 3);
    if (fresh.length) {
      html += '<div class="sect" style="padding-bottom:18px"><div class="card lg">' +
        '<div class="sect-head" style="margin-bottom:14px"><div class="eyebrow">Frisch freigeschaltet</div>' +
        '<div class="sect-link">Alle ' + unlockedTotal + '</div></div>' +
        '<div class="ach-fresh">' +
        fresh.map(function (e) {
          var a = defs[e.achId];
          return '<div class="row">' +
            '<div class="ach-ico ' + (a.tone === 'shame' ? 'alert' : 'acid') + '">' + a.emoji + '</div>' +
            '<div style="flex:1"><div class="t">' + esc(a.name) + '</div>' +
            '<div class="s">' + esc(playerName(e.playerId)) + ' · ' + esc(a.desc.charAt(0).toLowerCase() + a.desc.slice(1)) + '</div></div>' +
            '<div class="eyebrow" style="letter-spacing:.06em">' + esc(SA.fmtDateShort(e.date)) + '</div>' +
          '</div>';
        }).join('') +
      '</div></div></div>';
    }

    // Rekorde
    var recs = [];
    var mostPlayed = Object.keys(c.perGame).sort(function (a, b) { return c.perGame[b].plays - c.perGame[a].plays; })[0];
    if (mostPlayed && c.records.bestScoreByTitle[mostPlayed]) {
      var r0 = c.records.bestScoreByTitle[mostPlayed];
      recs.push({ v: r0.score, cls: 'acid', t: esc(mostPlayed) + '-Bestwert', s: esc(playerName(r0.playerId)) + ', ' + esc(SA.fmtDate(r0.date)) });
    }
    if (c.records.bestStreak) {
      recs.push({ v: '×' + c.records.bestStreak.len, cls: '', t: 'Längste Siegesserie', s: esc(playerName(c.records.bestStreak.playerId)) });
    }
    if (c.records.bestNightPoints) {
      recs.push({ v: c.records.bestNightPoints.points, cls: '', t: 'Punkte an einem Abend', s: esc(playerName(c.records.bestNightPoints.playerId)) + ', ' + esc(SA.fmtDateShort(c.records.bestNightPoints.date)) });
    }
    if (c.records.longestGameMin) {
      recs.push({ v: c.records.longestGameMin.min + "'", cls: 'alert', t: 'Längstes Spiel', s: esc(c.records.longestGameMin.title) + ', ' + esc(SA.fmtDateShort(c.records.longestGameMin.date)) });
    }
    recs.push({ v: c.playedNights.length, cls: '', t: 'Abende gespielt', s: c.playedNights.length ? 'seit ' + esc(SA.fmtDate(c.playedNights[0].date)) : '' });
    if (recs.length) {
      html += '<div class="sect-head" style="padding:0 20px 8px"><div class="eyebrow">Rekorde der Runde</div></div>' +
        '<div class="scroll-row" style="padding-bottom:18px">' +
        recs.map(function (r) {
          return '<div class="stat-tile"><div class="v ' + r.cls + '">' + r.v + '</div>' +
            '<div class="t">' + r.t + '</div><div class="s">' + r.s + '</div></div>';
        }).join('') + '</div>';
    }

    // Saisonmeister
    var championSeasons = c.seasons.filter(function (s) { return c.seasonWinners[s.id] && c.seasonWinners[s.id].length; });
    if (championSeasons.length) {
      html += '<div class="sect" style="padding-bottom:18px"><div class="eyebrow">Hall of Fame</div>' +
        championSeasons.map(function (s) {
          return '<div class="card" style="display:flex;align-items:center;gap:12px">' +
            '<div class="ach-ico acid">🥇</div>' +
            '<div style="flex:1"><div style="font:600 12.5px/1.2 var(--sys)">' + esc(c.seasonWinners[s.id].map(playerName).join(' & ')) + '</div>' +
            '<div style="font:400 10.5px/1.3 var(--sys);color:var(--mute);margin-top:3px">' + esc(s.name) + '</div></div>' +
          '</div>';
        }).join('') + '</div>';
    }

    // Alle Achievements
    html += '<div class="sect-head" style="padding:0 20px 10px"><div class="eyebrow">Alle Pokale</div></div><div class="ach-grid">' +
      c.achievements.map(function (a) {
        var owners = [];
        c.players.forEach(function (p) {
          if (c.achState[p.id] && c.achState[p.id][a.id]) owners.push(p);
        });
        var locked = owners.length === 0;
        return '<div class="ach-card' + (locked ? ' locked' : '') + '">' +
          '<div class="ach-ico ' + (locked ? 'lock' : (a.tone === 'shame' ? 'alert' : 'acid')) + '">' + a.emoji + '</div>' +
          '<div class="t">' + esc(a.name) + '</div>' +
          '<div class="s">' + esc(a.desc) + '</div>' +
          '<div class="owners">' + (locked
            ? '<div class="none">NOCH OFFEN</div>'
            : owners.map(function (p) { return '<div class="mini" title="' + esc(p.name) + '">' + esc(SA.shortCode(p)) + '</div>'; }).join('')) +
          '</div>' +
        '</div>';
      }).join('') + '</div>';

    $view.innerHTML = html;
  }

  // ── Spieler ──
  function renderSpieler() {
    var c = state.computed;
    var season = seasonById(state.seasonId) || c.currentSeason;
    var scopeKey = season ? season.id : 'all';
    var rows = c.table(scopeKey);
    var rowByPid = {};
    rows.forEach(function (r) { rowByPid[r.player.id] = r; });

    var html = '<div class="view-head"><div><div class="eyebrow acid">Die Runde</div>' +
      '<h1 class="h-display">Spieler</h1></div>' +
      '<div class="meta">' + c.players.length + ' Affen</div></div>' +
      '<div class="pl-grid">' +
      c.players.map(function (p) {
        var r = rowByPid[p.id];
        var all = c.table('all').filter(function (x) { return x.player.id === p.id; })[0];
        var streak = c.streaks[p.id] ? c.streaks[p.id].cur : 0;
        var sub = streak >= 2 ? streak + ' SIEGE IN FOLGE' : (r ? 'PLATZ ' + r.place + ' DER SAISON' : 'DIESE SAISON NOCH NICHT DABEI');
        return '<a class="pl-card" href="#spieler/' + esc(p.id) + '">' +
          '<div class="top">' + UI.avatar(p, { acid: !!(r && r.place === 1) }) +
            '<div style="min-width:0"><div class="nm">' + esc(p.name) + '</div>' +
            '<div class="sub">' + esc(sub) + '</div></div></div>' +
          '<div class="row">' +
            '<div class="kv"><div class="v">' + (r ? r.stats.points : 0) + '</div><div class="k">PKT</div></div>' +
            '<div class="kv"><div class="v">' + (r ? r.stats.nightWins : 0) + '</div><div class="k">SIEGE</div></div>' +
            '<div class="kv"><div class="v">' + (all ? all.stats.nights : 0) + '</div><div class="k">ABENDE</div></div>' +
          '</div>' +
        '</a>';
      }).join('') + '</div>';
    $view.innerHTML = html;
  }

  function renderProfil(pid) {
    var c = state.computed;
    var p = c.playerById[pid];
    if (!p) { location.hash = '#spieler'; return; }
    var season = seasonById(state.seasonId) || c.currentSeason;
    var sRows = c.table(season ? season.id : 'all');
    var sRow = sRows.filter(function (r) { return r.player.id === pid; })[0];
    var aRow = c.table('all').filter(function (r) { return r.player.id === pid; })[0];
    var tl = (c.timeline[pid] || []).slice(-5);
    var streak = c.streaks[pid] ? c.streaks[pid].cur : 0;

    var html = '<a class="back-btn" href="#spieler">← Alle Spieler</a>' +
      '<div class="profile-hero">' +
        '<div class="big' + (sRow && sRow.place === 1 ? ' acid' : '') + '">' + esc(SA.shortCode(p)) + '</div>' +
        '<div><h2>' + esc(p.name) + '</h2>' +
        '<div class="eyebrow tag ' + (streak >= 2 ? 'acid' : '') + '">' +
          (streak >= 2 ? streak + ' SIEGE IN FOLGE' : (sRow ? 'PLATZ ' + sRow.place + ' · ' + esc(season ? season.name : '') : 'OHNE SAISON-EINSATZ')) +
        '</div></div>' +
      '</div>' +
      '<div class="kpis">' +
        '<div class="kpi"><div class="v acid">' + (sRow ? sRow.stats.points : 0) + '</div><div class="k">PKT SAISON</div></div>' +
        '<div class="kpi"><div class="v">' + (sRow ? sRow.stats.nightWins : 0) + '/' + (sRow ? sRow.stats.nights : 0) + '</div><div class="k">SIEGE/ABENDE</div></div>' +
        '<div class="kpi"><div class="v">' + (aRow ? aRow.stats.points : 0) + '</div><div class="k">PKT EWIG</div></div>' +
      '</div>';

    // Formkurve
    if (tl.length) {
      html += '<div class="sect" style="padding-bottom:18px"><div class="card">' +
        '<div class="eyebrow" style="margin-bottom:12px">Form · letzte ' + tl.length + ' Abende</div>' +
        '<div class="form-bars">' +
        tl.map(function (t) {
          var info = null;
          c.nightInfos.forEach(function (i) { if (i.night.id === t.nightId) info = i; });
          var n = info ? info.eval.players.length : 6;
          var frac = n > 1 ? (n - t.place) / (n - 1) : 1;
          var h = Math.round(8 + frac * 32);
          return '<div class="bar' + (t.place === 1 ? ' win' : '') + '" style="height:' + h + 'px" title="Platz ' + t.place + '"></div>';
        }).join('') + '</div>' +
        '<div class="form-lbls">' + tl.map(function (t) { return '<div>' + (t.place === 1 ? 'SIEG' : 'P' + t.place) + '</div>'; }).join('') + '</div>' +
      '</div></div>';
    }

    // Angstgegner
    var nem = c.nemesisOf(pid);
    if (nem) {
      var np = c.playerById[nem.playerId];
      var detail = nem.worstTitle
        ? 'schlägt dich bei ' + nem.worstTitle.title + ' in ' + nem.worstTitle.lost + ' von ' + nem.worstTitle.shared + ' Partien'
        : 'liegt in ' + nem.lost + ' von ' + nem.shared + ' gemeinsamen Spielen vor dir';
      html += '<div class="sect" style="padding-bottom:18px"><div class="card lg">' +
        '<div class="eyebrow alert" style="margin-bottom:14px">Dein Angstgegner</div>' +
        '<div class="nemesis">' + UI.avatar(np, { lg: true }) +
          '<div class="info"><div class="t">' + esc(np.name) + '</div><div class="s">' + esc(detail) + '</div></div>' +
          '<div class="score"><div class="v">' + (nem.shared - nem.lost) + ':' + nem.lost + '</div><div class="k">BILANZ</div></div>' +
        '</div>' +
      '</div></div>';
    }

    // Lieblingsspiel (meiste Siege)
    var bestTitle = null;
    Object.keys(c.perGame).forEach(function (t) {
      var bp = c.perGame[t].byPlayer[pid];
      if (bp && bp.wins > 0 && (!bestTitle || bp.wins > bestTitle.wins)) bestTitle = { title: t, wins: bp.wins, played: bp.played };
    });
    var tipStats = sRow ? sRow.stats : (aRow ? aRow.stats : null);
    html += '<div class="sect" style="padding-bottom:18px"><div class="stat-grid">' +
      '<div class="stat-tile"><div class="v acid">' + (bestTitle ? bestTitle.wins : 0) + '</div>' +
        '<div class="t">' + esc(bestTitle ? bestTitle.title : 'Noch kein Lieblingsspiel') + '</div>' +
        '<div class="s">' + (bestTitle ? 'Siege in ' + bestTitle.played + ' Partien' : 'Erst mal eins gewinnen') + '</div></div>' +
      '<div class="stat-tile"><div class="v">' + (tipStats ? tipStats.tipBonuses : 0) + '</div>' +
        '<div class="t">Tipp-Boni</div><div class="s">' + (tipStats && tipStats.tipExacts ? tipStats.tipExacts + '× exakt getroffen' : 'davon 0 exakt') + '</div></div>' +
    '</div></div>';

    // Pokale des Spielers
    var defs = {};
    c.achievements.forEach(function (a) { defs[a.id] = a; });
    var own = Object.keys(c.achState[pid] || {});
    html += '<div class="sect" style="padding-bottom:8px"><div class="eyebrow">Pokale · ' + own.length + '</div>' +
      '<div class="ach-strip">' +
      (own.length ? own.map(function (aid) {
        var a = defs[aid];
        if (!a) return '';
        return '<div class="ach-ico ' + (a.tone === 'shame' ? 'alert' : 'acid') + '" title="' + esc(a.name + ' — ' + a.desc) + '">' + a.emoji + '</div>';
      }).join('') : '<div class="none" style="font:500 9px/34px var(--mono);color:rgba(255,255,255,.25);letter-spacing:.08em">NOCH KEINE</div>') +
      '</div></div>';

    $view.innerHTML = html;
  }

  // ── Footer / Quelle ──
  function sourceFooter() {
    var res = state.loaded;
    var badge, note;
    if (res.source === 'demo') {
      badge = '<span class="src-badge warn"><span class="dot"></span><span class="t">DEMO-DATEN</span></span>';
      note = 'Backend noch nicht konfiguriert — siehe DEPLOY.md im Repo.';
    } else if (res.source === 'cache') {
      badge = '<span class="src-badge warn"><span class="dot"></span><span class="t">OFFLINE-STAND</span></span>';
      note = 'Server gerade nicht erreichbar — zeige letzten geladenen Stand.';
    } else {
      badge = '<span class="src-badge"><span class="dot"></span><span class="t">LIVE</span></span>';
      note = res.updatedAt ? 'Stand: ' + new Date(res.updatedAt).toLocaleString('de-DE') : '';
    }
    return '<div class="footer-note">' + badge + '<br><br>' + esc(note) + '</div>';
  }

  function render() {
    if (!state.computed) return;
    var r = route();
    var tabs = document.querySelectorAll('.tabbar a[data-tab]');
    tabs.forEach(function (a) {
      a.classList.toggle('on', a.dataset.tab === r.view);
    });
    if (r.view === 'abende') renderAbende();
    else if (r.view === 'pokale') renderPokale();
    else if (r.view === 'spieler' && r.arg) renderProfil(r.arg);
    else if (r.view === 'spieler') renderSpieler();
    else renderTabelle();
    $view.insertAdjacentHTML('beforeend', sourceFooter());
    window.scrollTo(0, 0);
  }
})();
