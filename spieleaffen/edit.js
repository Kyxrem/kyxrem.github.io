/* SpieleAffen — edit.js: Editor mit persönlichem Zugangs-Token.
 * Jede Änderung wird über den Worker gespeichert und dort im Protokoll
 * mit Name + Zeitpunkt festgehalten (wer hat was geändert).
 * Ohne gültiges Token gibt es hier nichts zu holen — die Hauptseite bleibt read-only. */
(function () {
  'use strict';
  var SA = window.SA, UI = window.SA_UI, API = window.SA_API;
  var esc = UI.esc;

  var state = {
    me: null,          // {name, admin}
    loaded: null,      // {data, rev}
    computed: null,
    tab: 'abend',
    draft: null,       // Abend-Formular
    termin: null,      // Termin-Formular
    revealToken: null  // frisch erzeugtes Token (einmalige Anzeige)
  };

  var $view = document.getElementById('view');
  var todayIso = new Date().toISOString().slice(0, 10);

  // ── Boot ─────────────────────────────────────────────────
  function boot() {
    if (!API.hasBackend()) return renderNoBackend();
    if (!API.getToken()) return renderGate('');
    API.whoami().then(function (me) {
      state.me = me;
      return reloadData().then(renderApp);
    }).catch(function (err) {
      if (err.status === 401 || err.status === 403) {
        API.setToken('');
        renderGate('Token ungültig oder widerrufen. Frag den Admin nach einem neuen.');
      } else {
        renderGate('Server nicht erreichbar: ' + err.message);
      }
    });
  }

  function reloadData() {
    return API.loadData().then(function (res) {
      state.loaded = res;
      state.computed = SA.compute(res.data);
      return res;
    });
  }

  function data() { return state.loaded.data; }

  // ── Ohne Backend ─────────────────────────────────────────
  function renderNoBackend() {
    $view.innerHTML = '<div class="gate">' +
      '<div class="logo">SPIELE<em>AFFEN</em></div>' +
      '<p><b>Eintragen ist noch nicht eingerichtet.</b><br><br>' +
      'Die Hauptseite läuft gerade mit Demo-Daten. Damit die Runde selbst eintragen kann, ' +
      'muss einmalig das Backend (Cloudflare Worker, kostenlos) deployt und in <code>config.js</code> eingetragen werden.<br><br>' +
      'Die Anleitung steht in <code>spieleaffen/DEPLOY.md</code> im Repo.</p>' +
      '<form><a class="btn ghost" href="index.html">Zur Tabelle</a></form>' +
    '</div>';
  }

  // ── Token-Gate ───────────────────────────────────────────
  function renderGate(msg) {
    $view.innerHTML = '<div class="gate">' +
      '<div class="logo">SPIELE<em>AFFEN</em></div>' +
      '<p>Eintragen nur mit persönlichem Zugang. Jede Änderung wird mit deinem Namen im Protokoll vermerkt.</p>' +
      '<form id="gate-form">' +
        '<div class="field"><label>Dein Zugangs-Token</label>' +
        '<input class="input mono" id="gate-token" placeholder="sa_…" autocomplete="off" spellcheck="false"></div>' +
        (msg ? '<div class="err-note">' + esc(msg) + '</div>' : '') +
        '<button class="btn" type="submit">Anmelden</button>' +
        '<a class="linkish" style="text-align:center;padding-top:4px" href="index.html">Nur gucken → zur Tabelle</a>' +
      '</form>' +
    '</div>';
    var form = document.getElementById('gate-form');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var t = document.getElementById('gate-token').value.trim();
      if (!t) return;
      var btn = form.querySelector('.btn');
      btn.disabled = true; btn.textContent = 'Prüfe …';
      API.whoami(t).then(function (me) {
        API.setToken(t);
        state.me = me;
        return reloadData().then(renderApp);
      }).catch(function (err) {
        btn.disabled = false; btn.textContent = 'Anmelden';
        renderGate(err.status === 401 || err.status === 403
          ? 'Token ungültig oder widerrufen.'
          : 'Fehler: ' + err.message);
      });
    });
  }

  // ── App-Rahmen ───────────────────────────────────────────
  function renderApp() {
    state.revealToken = null;
    var tabs = [
      { id: 'abend', label: 'Abend' },
      { id: 'termin', label: 'Termin' },
      { id: 'spieler', label: 'Spieler' },
      { id: 'protokoll', label: 'Protokoll' }
    ];
    if (state.me.admin) tabs.push({ id: 'zugaenge', label: 'Zugänge' });

    var html = '<div class="edit-toolbar">' +
      '<div class="who">' + UI.avatar({ name: state.me.name }, { acid: true }) +
        '<div><div class="t">' + esc(state.me.name) + '</div>' +
        '<div class="s">' + (state.me.admin ? 'ADMIN · ' : '') + 'ÄNDERUNGEN WERDEN PROTOKOLLIERT</div></div></div>' +
      '<button class="linkish" id="logout">Abmelden</button>' +
    '</div>' +
    '<div class="seg">' + tabs.map(function (t) {
      return '<button class="chip' + (state.tab === t.id ? ' on' : '') + '" data-tab="' + t.id + '">' + esc(t.label) + '</button>';
    }).join('') + '</div>' +
    '<div id="tab-body"></div>';

    $view.innerHTML = html;
    document.getElementById('logout').addEventListener('click', function () {
      API.setToken('');
      state.me = null;
      renderGate('');
    });
    $view.querySelectorAll('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.tab = b.dataset.tab;
        state.draft = null; state.termin = null;
        renderApp();
      });
    });
    renderTab();
  }

  function renderTab() {
    var body = document.getElementById('tab-body');
    if (state.tab === 'abend') renderAbendTab(body);
    else if (state.tab === 'termin') renderTerminTab(body);
    else if (state.tab === 'spieler') renderSpielerTab(body);
    else if (state.tab === 'protokoll') renderProtokollTab(body);
    else if (state.tab === 'zugaenge') renderZugaengeTab(body);
  }

  // ── Speichern (gemeinsamer Pfad) ─────────────────────────
  function save(newData, summary, after) {
    API.saveData(newData, state.loaded.rev, summary).then(function (res) {
      state.loaded.data = newData;
      state.loaded.rev = res.rev;
      state.computed = SA.compute(newData);
      UI.toast('Gespeichert — ' + summary);
      if (after) after(true);
    }).catch(function (err) {
      if (err.status === 409) {
        UI.toast('Jemand war schneller — Stand neu geladen, bitte nochmal speichern.', true);
        reloadData().then(function () { if (after) after(false); else renderTab(); });
      } else if (err.status === 401 || err.status === 403) {
        API.setToken('');
        renderGate('Token nicht mehr gültig.');
      } else {
        UI.toast('Fehler beim Speichern: ' + err.message, true);
        if (after) after(false);
      }
    });
  }

  function cloneData() { return JSON.parse(JSON.stringify(data())); }

  // ═════════════════════ TAB: ABEND ════════════════════════
  function renderAbendTab(body) {
    if (state.draft) return renderNightForm(body);
    var c = state.computed;
    var playedDesc = c.nightInfos.slice().reverse();
    var plannedOpen = c.plannedNights.filter(function (n) { return n.date >= todayIso; });

    var html = '<div class="sect" style="gap:10px">' +
      '<button class="btn" id="new-night">＋ Abend erfassen</button>';
    if (plannedOpen.length) {
      html += '<div class="eyebrow" style="padding-top:8px">Geplante Termine — Ergebnisse nachtragen</div>' +
        plannedOpen.map(function (n) {
          return '<button class="card next-night" data-fill="' + esc(n.id) + '" style="width:100%;text-align:left">' +
            '<div class="date"><div class="d">' + SA.dayNum(n.date) + '</div><div class="m">' + esc(SA.monthAbbr(n.date)) + '</div></div>' +
            '<div class="info"><div class="t">' + esc(n.plannedGames || 'Spieleabend') + '</div>' +
            '<div class="s">Antippen und Ergebnisse eintragen</div></div>' +
            '<div class="pill">Eintragen</div>' +
          '</button>';
        }).join('');
    }
    html += '<div class="eyebrow" style="padding-top:8px">Gespielte Abende — antippen zum Bearbeiten</div>' +
      (playedDesc.length ? playedDesc.map(function (info) {
        var n = info.night;
        var titles = (n.games || []).map(function (g) { return g.title; }).join(' · ');
        var winners = info.eval.winners.map(function (pid) { return c.playerById[pid] ? c.playerById[pid].name : pid; }).join(' & ');
        return '<button class="card next-night" data-edit="' + esc(n.id) + '" style="width:100%;text-align:left">' +
          '<div class="date"><div class="d">' + SA.dayNum(n.date) + '</div><div class="m">' + esc(SA.monthAbbr(n.date)) + '</div></div>' +
          '<div class="info"><div class="t">' + esc(titles) + '</div>' +
          '<div class="s">Abendsieg: ' + esc(winners) + '</div></div>' +
        '</button>';
      }).join('') : '<div class="card" style="color:var(--mute);font:400 12px/1.5 var(--sys)">Noch keine Abende erfasst.</div>') +
    '</div>';
    body.innerHTML = html;

    document.getElementById('new-night').addEventListener('click', function () {
      state.draft = newDraft(null);
      renderTab();
    });
    body.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var n = data().nights.filter(function (x) { return x.id === b.dataset.edit; })[0];
        state.draft = newDraft(n);
        renderTab();
      });
    });
    body.querySelectorAll('[data-fill]').forEach(function (b) {
      b.addEventListener('click', function () {
        var n = data().nights.filter(function (x) { return x.id === b.dataset.fill; })[0];
        var d = newDraft(n);
        if (!d.games.length) d.games.push(newGame());
        state.draft = d;
        renderTab();
      });
    });
  }

  function newGame() {
    return { id: SA.uid('g'), title: '', durationMin: null, lowerWins: false, results: {} };
  }

  // Draft: results als Map playerId -> {on, score, tip} (einfacher fürs Formular)
  function newDraft(night) {
    if (!night) {
      var g = newGame();
      data().players.forEach(function (p) { g.results[p.id] = { on: true, score: '', tip: '' }; });
      return { id: null, date: todayIso, hostId: '', games: [g], existing: false };
    }
    var d = {
      id: night.id, date: night.date, hostId: night.hostId || '',
      time: night.time, plannedGames: night.plannedGames, yes: night.yes,
      existing: (night.games || []).length > 0,
      games: (night.games || []).map(function (g) {
        var res = {};
        data().players.forEach(function (p) { res[p.id] = { on: false, score: '', tip: '' }; });
        (g.results || []).forEach(function (r) {
          res[r.playerId] = { on: true, score: String(r.score), tip: (r.tip === 0 || r.tip) ? String(r.tip) : '' };
        });
        return { id: g.id, title: g.title, durationMin: g.durationMin || null, lowerWins: !!g.lowerWins, results: res };
      })
    };
    if (!d.games.length) {
      var g2 = newGame();
      data().players.forEach(function (p) { g2.results[p.id] = { on: true, score: '', tip: '' }; });
      d.games = [g2];
    }
    return d;
  }

  function knownTitles() {
    var set = {};
    (data().nights || []).forEach(function (n) {
      (n.games || []).forEach(function (g) { set[g.title] = true; });
    });
    return Object.keys(set).sort();
  }

  function renderNightForm(body) {
    var d = state.draft;
    var players = data().players;

    var html = '<div class="sect" style="gap:12px">' +
      '<button class="linkish" id="back" style="text-align:left">← Zurück zur Liste</button>' +
      '<div class="field"><label>Datum</label><input class="input" type="date" id="f-date" value="' + esc(d.date) + '"></div>' +
      '<div class="field"><label>Gastgeber</label><select class="input" id="f-host">' +
        '<option value="">—</option>' +
        players.map(function (p) { return '<option value="' + esc(p.id) + '"' + (d.hostId === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') +
      '</select></div>' +
      '<datalist id="titles">' + knownTitles().map(function (t) { return '<option value="' + esc(t) + '">'; }).join('') + '</datalist>' +
      '<div id="games"></div>' +
      '<button class="btn ghost" id="add-game">＋ Spiel hinzufügen</button>' +
      '<div class="card" id="preview" style="display:none"></div>' +
      '<button class="btn" id="save-night">Abend speichern</button>' +
      (d.id && d.existing ? '<button class="btn danger" id="del-night">Abend löschen</button>' : '') +
    '</div>';
    body.innerHTML = html;

    var $games = document.getElementById('games');
    function renderGames() {
      $games.innerHTML = d.games.map(function (g, gi) {
        return '<div class="game-editor" data-gi="' + gi + '" style="margin-bottom:12px">' +
          '<div class="ghead">' +
            '<input class="input" list="titles" placeholder="Spiel (z. B. Catan)" value="' + esc(g.title) + '" data-f="title">' +
            '<input class="input" style="width:74px;text-align:right" type="number" min="1" placeholder="min" value="' + (g.durationMin || '') + '" data-f="dur">' +
            (d.games.length > 1 ? '<button class="btn danger sm" data-del-game>✕</button>' : '') +
          '</div>' +
          '<label class="check-row"><input type="checkbox" data-f="lower"' + (g.lowerWins ? ' checked' : '') + '> Weniger ist besser (z.&nbsp;B. 6 nimmt!)</label>' +
          '<div class="res-grid">' +
            '<div class="hd">Spieler</div><div class="hd" style="text-align:right">Punkte</div><div class="hd" style="text-align:right">Tipp</div>' +
            players.map(function (p) {
              var r = g.results[p.id] || { on: false, score: '', tip: '' };
              return '<label class="pname"><input type="checkbox" data-p="' + esc(p.id) + '" data-f="on"' + (r.on ? ' checked' : '') + ' style="accent-color:var(--acid)"> ' +
                  UI.avatar(p) + '<span>' + esc(p.name) + '</span></label>' +
                '<input class="input" type="number" step="any" data-p="' + esc(p.id) + '" data-f="score" value="' + esc(r.score) + '"' + (r.on ? '' : ' disabled') + '>' +
                '<input class="input" type="number" step="any" data-p="' + esc(p.id) + '" data-f="tip" value="' + esc(r.tip) + '"' + (r.on ? '' : ' disabled') + ' placeholder="–">';
            }).join('') +
          '</div>' +
        '</div>';
      }).join('');
      bindGames();
      preview();
    }

    function bindGames() {
      $games.querySelectorAll('.game-editor').forEach(function (ge) {
        var gi = parseInt(ge.dataset.gi, 10);
        var g = d.games[gi];
        ge.querySelectorAll('[data-f]').forEach(function (inp) {
          var f = inp.dataset.f, pid = inp.dataset.p;
          inp.addEventListener(inp.type === 'checkbox' ? 'change' : 'input', function () {
            if (f === 'title') g.title = inp.value;
            else if (f === 'dur') g.durationMin = inp.value ? parseInt(inp.value, 10) : null;
            else if (f === 'lower') { g.lowerWins = inp.checked; preview(); }
            else if (f === 'on') {
              g.results[pid].on = inp.checked;
              ge.querySelectorAll('[data-p="' + pid + '"][data-f="score"],[data-p="' + pid + '"][data-f="tip"]').forEach(function (x) { x.disabled = !inp.checked; });
              preview();
            }
            else if (f === 'score') { g.results[pid].score = inp.value; preview(); }
            else if (f === 'tip') { g.results[pid].tip = inp.value; preview(); }
          });
        });
        var delBtn = ge.querySelector('[data-del-game]');
        if (delBtn) delBtn.addEventListener('click', function () {
          d.games.splice(gi, 1);
          renderGames();
        });
      });
    }

    // Live-Vorschau: Abendwertung aus den aktuellen Eingaben
    function preview() {
      var night = draftToNight(d, true);
      var $p = document.getElementById('preview');
      if (!night || !night.games.length) { $p.style.display = 'none'; return; }
      var ev = SA.evalNight(night);
      if (!ev.players.length) { $p.style.display = 'none'; return; }
      var rows = ev.players.map(function (pid) { return { pid: pid, e: ev.per[pid] }; });
      rows.sort(function (a, b) { return a.e.place - b.e.place; });
      $p.style.display = '';
      $p.innerHTML = '<div class="eyebrow" style="margin-bottom:10px">Vorschau Abendwertung</div>' +
        '<div class="reslist">' + rows.map(function (r) {
          var p = state.computed.playerById[r.pid] || { name: r.pid };
          return '<div class="resrow' + (r.e.place === 1 ? ' first' : '') + '">' +
            '<div class="p">' + r.e.place + '</div>' +
            '<div class="n">' + esc(p.name) + '</div>' +
            '<div class="tip">' + r.e.placePts + 'P' + (r.e.tipPts ? ' +' + r.e.tipPts + ' TIPP' : '') + ' +' + r.e.partPts + '</div>' +
            '<div class="sc">' + r.e.total + ' PKT</div>' +
          '</div>';
        }).join('') + '</div>';
    }

    document.getElementById('back').addEventListener('click', function () { state.draft = null; renderTab(); });
    document.getElementById('f-date').addEventListener('input', function () { d.date = this.value; });
    document.getElementById('f-host').addEventListener('change', function () { d.hostId = this.value; });
    document.getElementById('add-game').addEventListener('click', function () {
      var g = newGame();
      data().players.forEach(function (p) {
        var prev = d.games.length ? d.games[d.games.length - 1].results[p.id] : null;
        g.results[p.id] = { on: prev ? prev.on : true, score: '', tip: '' };
      });
      d.games.push(g);
      renderGames();
    });
    document.getElementById('save-night').addEventListener('click', saveNight);
    var delNight = document.getElementById('del-night');
    if (delNight) delNight.addEventListener('click', function () {
      if (!confirm('Diesen Abend wirklich löschen? Das lässt sich nicht rückgängig machen.')) return;
      var nd = cloneData();
      nd.nights = nd.nights.filter(function (n) { return n.id !== d.id; });
      save(nd, 'Abend ' + SA.fmtDate(d.date) + ' gelöscht', function (ok) {
        if (ok) { state.draft = null; renderTab(); }
      });
    });

    function draftToNight(d2, silent) {
      var games = [];
      for (var gi = 0; gi < d2.games.length; gi++) {
        var g = d2.games[gi];
        var results = [];
        Object.keys(g.results).forEach(function (pid) {
          var r = g.results[pid];
          if (!r.on) return;
          if (r.score === '' || isNaN(parseFloat(r.score))) return;
          var row = { playerId: pid, score: parseFloat(r.score) };
          if (r.tip !== '' && !isNaN(parseFloat(r.tip))) row.tip = parseFloat(r.tip);
          results.push(row);
        });
        if (!g.title.trim() && !results.length) continue; // leeres Spiel ignorieren
        if (!silent) {
          if (!g.title.trim()) { UI.toast('Spiel ' + (gi + 1) + ': Name fehlt.', true); return null; }
          if (results.length < 2) { UI.toast(esc(g.title) + ': mindestens zwei Spieler mit Punkten.', true); return null; }
        }
        var game = { id: g.id, title: g.title.trim(), results: results };
        if (g.durationMin) game.durationMin = g.durationMin;
        if (g.lowerWins) game.lowerWins = true;
        games.push(game);
      }
      var night = { id: d2.id || SA.uid('n'), date: d2.date, games: games };
      if (d2.hostId) night.hostId = d2.hostId;
      if (d2.time) night.time = d2.time;
      if (d2.plannedGames) night.plannedGames = d2.plannedGames;
      if (d2.yes) night.yes = d2.yes;
      return night;
    }

    function saveNight() {
      if (!d.date) { UI.toast('Datum fehlt.', true); return; }
      var night = draftToNight(d, false);
      if (!night) return;
      if (!night.games.length) { UI.toast('Mindestens ein Spiel mit Ergebnissen eintragen.', true); return; }
      var nd = cloneData();
      var idx = -1;
      nd.nights.forEach(function (n, i) { if (n.id === night.id) idx = i; });
      var isNew = idx < 0;
      if (isNew) nd.nights.push(night); else nd.nights[idx] = night;
      var titles = night.games.map(function (g) { return g.title; }).join(', ');
      var summary = 'Abend ' + SA.fmtDate(night.date) + (isNew ? ' angelegt' : ' geändert') + ' (' + titles + ')';
      save(nd, summary, function (ok) {
        if (ok) { state.draft = null; renderTab(); }
      });
    }

    renderGames();
  }

  // ═════════════════════ TAB: TERMIN ═══════════════════════
  function renderTerminTab(body) {
    var c = state.computed;
    var t = state.termin;
    var players = data().players;
    var planned = c.plannedNights.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });

    if (!t) {
      body.innerHTML = '<div class="sect" style="gap:10px">' +
        '<button class="btn" id="new-termin">＋ Termin planen</button>' +
        (planned.length ? '<div class="eyebrow" style="padding-top:8px">Geplant</div>' +
          planned.map(function (n) {
            var host = n.hostId ? c.playerById[n.hostId] : null;
            return '<button class="card next-night" data-edit="' + esc(n.id) + '" style="width:100%;text-align:left">' +
              '<div class="date"><div class="d">' + SA.dayNum(n.date) + '</div><div class="m">' + esc(SA.monthAbbr(n.date)) + '</div></div>' +
              '<div class="info"><div class="t">' + (host ? 'Bei ' + esc(host.name) : 'Spieleabend') + (n.time ? ' · ' + esc(n.time) : '') + '</div>' +
              '<div class="s">' + esc(n.plannedGames || '') + ((n.yes || []).length ? ' · ' + (n.yes || []).length + ' zugesagt' : '') + '</div></div>' +
            '</button>';
          }).join('') : '<div class="card" style="color:var(--mute);font:400 12px/1.5 var(--sys)">Kein Termin geplant.</div>') +
      '</div>';
      document.getElementById('new-termin').addEventListener('click', function () {
        state.termin = { id: null, date: '', time: '19:30', hostId: '', plannedGames: '', yes: [] };
        renderTab();
      });
      body.querySelectorAll('[data-edit]').forEach(function (b) {
        b.addEventListener('click', function () {
          var n = data().nights.filter(function (x) { return x.id === b.dataset.edit; })[0];
          state.termin = { id: n.id, date: n.date, time: n.time || '', hostId: n.hostId || '', plannedGames: n.plannedGames || '', yes: (n.yes || []).slice() };
          renderTab();
        });
      });
      return;
    }

    body.innerHTML = '<div class="sect" style="gap:12px">' +
      '<button class="linkish" id="back" style="text-align:left">← Zurück</button>' +
      '<div class="field"><label>Datum</label><input class="input" type="date" id="t-date" value="' + esc(t.date) + '"></div>' +
      '<div class="field"><label>Uhrzeit</label><input class="input" type="time" id="t-time" value="' + esc(t.time) + '"></div>' +
      '<div class="field"><label>Gastgeber</label><select class="input" id="t-host">' +
        '<option value="">—</option>' +
        players.map(function (p) { return '<option value="' + esc(p.id) + '"' + (t.hostId === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="field"><label>Geplante Spiele</label><input class="input" id="t-games" placeholder="z. B. Dune Imperium, danach 6 nimmt!" value="' + esc(t.plannedGames) + '"></div>' +
      '<div class="field"><label>Zugesagt</label><div class="card" style="display:flex;flex-direction:column;gap:10px">' +
        players.map(function (p) {
          return '<label class="check-row"><input type="checkbox" data-yes="' + esc(p.id) + '"' + (t.yes.indexOf(p.id) >= 0 ? ' checked' : '') + '> ' + esc(p.name) + '</label>';
        }).join('') + '</div></div>' +
      '<button class="btn" id="save-termin">Termin speichern</button>' +
      (t.id ? '<button class="btn danger" id="del-termin">Termin löschen</button>' : '') +
    '</div>';

    document.getElementById('back').addEventListener('click', function () { state.termin = null; renderTab(); });
    document.getElementById('t-date').addEventListener('input', function () { t.date = this.value; });
    document.getElementById('t-time').addEventListener('input', function () { t.time = this.value; });
    document.getElementById('t-host').addEventListener('change', function () { t.hostId = this.value; });
    document.getElementById('t-games').addEventListener('input', function () { t.plannedGames = this.value; });
    body.querySelectorAll('[data-yes]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var pid = cb.dataset.yes;
        if (cb.checked) { if (t.yes.indexOf(pid) < 0) t.yes.push(pid); }
        else t.yes = t.yes.filter(function (x) { return x !== pid; });
      });
    });
    document.getElementById('save-termin').addEventListener('click', function () {
      if (!t.date) { UI.toast('Datum fehlt.', true); return; }
      var nd = cloneData();
      var night = { id: t.id || SA.uid('n'), date: t.date, games: [] };
      if (t.time) night.time = t.time;
      if (t.hostId) night.hostId = t.hostId;
      if (t.plannedGames) night.plannedGames = t.plannedGames;
      if (t.yes.length) night.yes = t.yes;
      var idx = -1;
      nd.nights.forEach(function (n, i) { if (n.id === night.id) idx = i; });
      if (idx < 0) nd.nights.push(night);
      else {
        night.games = nd.nights[idx].games || []; // niemals Ergebnisse überschreiben
        nd.nights[idx] = night;
      }
      save(nd, 'Termin ' + SA.fmtDate(night.date) + (idx < 0 ? ' geplant' : ' geändert'), function (ok) {
        if (ok) { state.termin = null; renderTab(); }
      });
    });
    var del = document.getElementById('del-termin');
    if (del) del.addEventListener('click', function () {
      if (!confirm('Termin löschen?')) return;
      var nd = cloneData();
      nd.nights = nd.nights.filter(function (n) { return n.id !== t.id; });
      save(nd, 'Termin ' + SA.fmtDate(t.date) + ' gelöscht', function (ok) {
        if (ok) { state.termin = null; renderTab(); }
      });
    });
  }

  // ═════════════════════ TAB: SPIELER ══════════════════════
  function renderSpielerTab(body) {
    var players = data().players;
    var used = {};
    (data().nights || []).forEach(function (n) {
      if (n.hostId) used[n.hostId] = true;
      (n.yes || []).forEach(function (pid) { used[pid] = true; });
      (n.games || []).forEach(function (g) {
        (g.results || []).forEach(function (r) { used[r.playerId] = true; });
      });
    });

    body.innerHTML = '<div class="sect" style="gap:12px">' +
      '<div class="eyebrow">Die Runde</div>' +
      players.map(function (p, i) {
        return '<div class="card" style="display:flex;align-items:center;gap:10px" data-pi="' + i + '">' +
          UI.avatar(p) +
          '<input class="input" style="flex:1" value="' + esc(p.name) + '" data-f="name">' +
          '<input class="input" style="width:56px;text-transform:uppercase" maxlength="2" value="' + esc(p.short || '') + '" data-f="short" placeholder="KZ">' +
          (used[p.id] ? '' : '<button class="btn danger sm" data-del>✕</button>') +
        '</div>';
      }).join('') +
      '<button class="btn ghost" id="save-players">Änderungen speichern</button>' +
      '<div class="hr" style="margin:8px 0"></div>' +
      '<div class="eyebrow">Neuer Affe</div>' +
      '<div style="display:flex;gap:8px">' +
        '<input class="input" id="np-name" placeholder="Name" style="flex:1">' +
        '<button class="btn sm" id="add-player" style="width:auto">Hinzufügen</button>' +
      '</div>' +
      '<p style="font:400 10.5px/1.5 var(--sys);color:var(--faint)">Spieler mit erfassten Ergebnissen lassen sich nicht löschen — die Historie bleibt ehrlich.</p>' +
      '<div class="hr" style="margin:8px 0"></div>' +
      '<div class="eyebrow">Saisons</div>' +
      '<div id="season-rows" style="display:flex;flex-direction:column;gap:10px">' +
      (data().seasons || []).map(function (s, i) {
        return '<div class="card" style="display:flex;flex-direction:column;gap:8px" data-si="' + i + '">' +
          '<input class="input" value="' + esc(s.name) + '" data-f="name" placeholder="Name (z. B. Saison 1 · Winter 26)">' +
          '<div style="display:flex;gap:8px">' +
            '<input class="input" type="date" value="' + esc(s.start) + '" data-f="start" style="flex:1">' +
            '<input class="input" type="date" value="' + esc(s.end) + '" data-f="end" style="flex:1">' +
          '</div>' +
        '</div>';
      }).join('') + '</div>' +
      '<div style="display:flex;gap:8px">' +
        '<button class="btn ghost" id="add-season" style="flex:1">＋ Saison</button>' +
        '<button class="btn" id="save-seasons" style="flex:1">Saisons speichern</button>' +
      '</div>' +
      '<p style="font:400 10.5px/1.5 var(--sys);color:var(--faint)">Abende zählen automatisch zur Saison, in deren Zeitraum ihr Datum fällt.</p>' +
    '</div>';

    var edited = JSON.parse(JSON.stringify(players));
    body.querySelectorAll('[data-pi]').forEach(function (row) {
      var i = parseInt(row.dataset.pi, 10);
      row.querySelector('[data-f="name"]').addEventListener('input', function () { edited[i].name = this.value; });
      row.querySelector('[data-f="short"]').addEventListener('input', function () { edited[i].short = this.value.toUpperCase(); });
      var del = row.querySelector('[data-del]');
      if (del) del.addEventListener('click', function () {
        if (!confirm(edited[i].name + ' löschen?')) return;
        var nd = cloneData();
        var name = nd.players[i].name;
        nd.players.splice(i, 1);
        save(nd, 'Spieler ' + name + ' entfernt', function (ok) { if (ok) renderTab(); });
      });
    });
    document.getElementById('save-players').addEventListener('click', function () {
      var changes = [];
      edited.forEach(function (p, i) {
        var old = players[i];
        if (!old) return;
        if (old.name !== p.name.trim() && p.name.trim()) changes.push(old.name + ' → ' + p.name.trim());
      });
      var nd = cloneData();
      nd.players = edited.map(function (p) {
        var np = { id: p.id, name: p.name.trim() || p.id };
        if (p.short && p.short.trim()) np.short = p.short.trim().toUpperCase().slice(0, 2);
        return np;
      });
      save(nd, changes.length ? 'Spieler umbenannt: ' + changes.join(', ') : 'Spielerliste angepasst', function (ok) { if (ok) renderTab(); });
    });
    document.getElementById('add-player').addEventListener('click', function () {
      var name = document.getElementById('np-name').value.trim();
      if (!name) return;
      var id = name.toLowerCase().replace(/[äöüß]/g, function (ch) {
        return { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' }[ch];
      }).replace(/[^a-z0-9]/g, '') || SA.uid('p');
      var base = id, k = 2;
      while (data().players.some(function (p) { return p.id === id; })) id = base + (k++);
      var nd = cloneData();
      nd.players.push({ id: id, name: name });
      save(nd, 'Spieler ' + name + ' hinzugefügt', function (ok) { if (ok) renderTab(); });
    });

    // Saisons
    var editedSeasons = JSON.parse(JSON.stringify(data().seasons || []));
    body.querySelectorAll('[data-si]').forEach(function (row) {
      var i = parseInt(row.dataset.si, 10);
      row.querySelectorAll('[data-f]').forEach(function (inp) {
        inp.addEventListener('input', function () { editedSeasons[i][inp.dataset.f] = inp.value; });
      });
    });
    document.getElementById('add-season').addEventListener('click', function () {
      var n = (data().seasons || []).length + 1;
      var start = new Date();
      var end = new Date(start.getTime());
      end.setMonth(end.getMonth() + 3);
      var nd = cloneData();
      nd.seasons.push({
        id: 's' + Date.now().toString(36),
        name: 'Saison ' + n,
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10)
      });
      save(nd, 'Saison ' + n + ' angelegt', function (ok) { if (ok) renderTab(); });
    });
    document.getElementById('save-seasons').addEventListener('click', function () {
      for (var i = 0; i < editedSeasons.length; i++) {
        var s = editedSeasons[i];
        if (!s.name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(s.start) || !/^\d{4}-\d{2}-\d{2}$/.test(s.end) || s.end < s.start) {
          UI.toast('Saison ' + (i + 1) + ': Name und gültiger Zeitraum nötig.', true);
          return;
        }
      }
      var nd = cloneData();
      nd.seasons = editedSeasons;
      save(nd, 'Saisons angepasst', function (ok) { if (ok) renderTab(); });
    });
  }

  // ═════════════════════ TAB: PROTOKOLL ════════════════════
  function renderProtokollTab(body) {
    body.innerHTML = '<div class="sect"><div class="eyebrow">Wer hat was geändert</div>' +
      '<div class="card" id="log-box" style="padding:4px 15px"><div style="padding:12px 0;color:var(--mute);font:400 12px/1.5 var(--sys)">Lade Protokoll …</div></div></div>';
    API.loadLog(200).then(function (res) {
      var entries = res.entries || [];
      var box = document.getElementById('log-box');
      if (!entries.length) {
        box.innerHTML = '<div style="padding:12px 0;color:var(--mute);font:400 12px/1.5 var(--sys)">Noch keine Einträge.</div>';
        return;
      }
      box.innerHTML = entries.map(function (e) {
        var when = new Date(e.ts).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
        return '<div class="log-item">' +
          UI.avatar({ name: e.who }) +
          '<div class="b"><div class="t"><b>' + esc(e.who) + '</b> · ' + esc(e.summary || e.action || '') + '</div>' +
          '<div class="s">' + esc(when) + (e.auto ? ' · ' + esc(e.auto) : '') + '</div></div>' +
        '</div>';
      }).join('');
    }).catch(function (err) {
      document.getElementById('log-box').innerHTML = '<div class="err-note" style="padding:12px 0">Protokoll nicht ladbar: ' + esc(err.message) + '</div>';
    });
  }

  // ═════════════════════ TAB: ZUGÄNGE (Admin) ══════════════
  function renderZugaengeTab(body) {
    body.innerHTML = '<div class="sect" style="gap:12px">' +
      '<div class="eyebrow">Persönliche Zugangs-Tokens</div>' +
      '<p style="font:400 11.5px/1.6 var(--sys);color:var(--mute)">Jede Person bekommt ein eigenes Token — so steht im Protokoll, wer was geändert hat. Das Token wird nur einmal angezeigt: direkt kopieren und z.&nbsp;B. per Messenger schicken.</p>' +
      '<div style="display:flex;gap:8px">' +
        '<input class="input" id="tk-name" placeholder="Name (z. B. Torben)" style="flex:1">' +
        '<button class="btn sm" id="tk-create" style="width:auto">Erzeugen</button>' +
      '</div>' +
      '<div id="tk-reveal"></div>' +
      '<div class="card" id="tk-list" style="padding:4px 15px"><div style="padding:12px 0;color:var(--mute);font:400 12px/1.5 var(--sys)">Lade …</div></div>' +
    '</div>';

    function refreshList() {
      API.listTokens().then(function (res) {
        var list = document.getElementById('tk-list');
        var tokens = res.tokens || [];
        if (!tokens.length) {
          list.innerHTML = '<div style="padding:12px 0;color:var(--mute);font:400 12px/1.5 var(--sys)">Noch keine Tokens erzeugt.</div>';
          return;
        }
        list.innerHTML = tokens.map(function (t) {
          var meta = t.prefix + '… · erstellt ' + new Date(t.createdAt).toLocaleDateString('de-DE') +
            (t.lastUsedAt ? ' · zuletzt ' + new Date(t.lastUsedAt).toLocaleDateString('de-DE') : ' · noch nie benutzt');
          return '<div class="token-item' + (t.revokedAt ? ' revoked' : '') + '">' +
            UI.avatar({ name: t.name }) +
            '<div class="b"><div class="t">' + esc(t.name) + (t.revokedAt ? ' (widerrufen)' : '') + '</div>' +
            '<div class="s">' + esc(meta) + '</div></div>' +
            (t.revokedAt ? '' : '<button class="btn danger sm" data-revoke="' + esc(t.id) + '">Widerrufen</button>') +
          '</div>';
        }).join('');
        list.querySelectorAll('[data-revoke]').forEach(function (b) {
          b.addEventListener('click', function () {
            if (!confirm('Token widerrufen? Die Person kann dann nichts mehr ändern.')) return;
            API.revokeToken(b.dataset.revoke).then(refreshList).catch(function (err) {
              UI.toast('Fehler: ' + err.message, true);
            });
          });
        });
      }).catch(function (err) {
        document.getElementById('tk-list').innerHTML = '<div class="err-note" style="padding:12px 0">' + esc(err.message) + '</div>';
      });
    }

    document.getElementById('tk-create').addEventListener('click', function () {
      var name = document.getElementById('tk-name').value.trim();
      if (!name) { UI.toast('Name fehlt.', true); return; }
      API.createToken(name).then(function (res) {
        document.getElementById('tk-name').value = '';
        var box = document.getElementById('tk-reveal');
        box.innerHTML = '<div class="field"><label>Token für ' + esc(name) + ' — jetzt kopieren, wird nicht wieder angezeigt</label>' +
          '<div class="token-reveal" id="tk-value">' + esc(res.token) + '</div>' +
          '<button class="btn ghost" id="tk-copy">Kopieren</button></div>';
        document.getElementById('tk-copy').addEventListener('click', function () {
          var txt = res.token;
          (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () {
            UI.toast('Token kopiert.');
          }).catch(function () {
            var el = document.getElementById('tk-value');
            var range = document.createRange();
            range.selectNodeContents(el);
            var sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
            UI.toast('Markiert — mit Strg/Cmd+C kopieren.');
          });
        });
        refreshList();
      }).catch(function (err) {
        UI.toast('Fehler: ' + err.message, true);
      });
    });

    refreshList();
  }

  boot();
})();
