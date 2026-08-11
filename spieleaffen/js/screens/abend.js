/* SpieleAffen — Abend läuft.
 * Aus ui_kits/dashboard/NightScreen.jsx: Rundenfortschritt, Punkteingabe je
 * Affe (±5, Strafe −20), Einstellungen des Abends.
 *
 * Punsch ist hier erlaubt — es läuft ja wirklich etwas.
 */
(function () {
  'use strict';
  var h = window.h, U = window.SA_UI, SA = window.SA, S = window.SA_STORE, T = window.SA_TEASE;

  var ansicht = 'runde';   // 'runde' | 'gesamt' — bleibt über Neuzeichnen erhalten

  function dauer(live) {
    if (!live || !live.startedAt) return { value: '—', unit: '' };
    var teile = String(live.startedAt).split(':');
    var start = new Date();
    start.setHours(Number(teile[0]) || 0, Number(teile[1]) || 0, 0, 0);
    var min = Math.max(0, Math.round((Date.now() - start.getTime()) / 60000));
    return { value: Math.floor(min / 60) + ':' + String(min % 60).padStart(2, '0'), unit: 'h' };
  }

  function spielDesAbends(live) {
    return (live.games || [])[0] || null;
  }

  function bump(live, playerId, by) {
    S.update(function (doc) {
      var n = doc.nights.filter(function (x) { return x.id === live.id; })[0];
      if (!n) return false;
      var g = (n.games || [])[0];
      if (!g) return false;
      var r = (g.results || []).filter(function (x) { return x.playerId === playerId; })[0];
      if (!r) { r = { playerId: playerId, score: 0 }; g.results.push(r); }
      r.score = Number(r.score || 0) + by;
    }, { summary: 'Punkte geändert (' + (by > 0 ? '+' : '') + by + ')', quiet: true });
  }

  function strafe(live, affe) {
    S.update(function (doc) {
      var n = doc.nights.filter(function (x) { return x.id === live.id; })[0];
      if (!n) return false;
      var g = (n.games || [])[0];
      if (!g) return false;
      var r = (g.results || []).filter(function (x) { return x.playerId === affe.id; })[0];
      if (!r) { r = { playerId: affe.id, score: 0 }; g.results.push(r); }
      r.strafe = true;
    }, {
      summary: 'Strafe für ' + affe.name,
      entries: [{ icon: 'skull', tone: 'punsch', text: 'Strafe für ' + affe.name + '.', to: '−' + SA.STRAFE_POINTS + ' Pkt' }]
    }).then(function () {
      S.toast('Strafe notiert', SA.STRAFE_POINTS + ' Punkte weg. Selbst schuld.', 'punsch');
    }).catch(function () { /* Meldung kam schon vom Store */ });
  }

  window.SA_SCREENS = window.SA_SCREENS || {};
  window.SA_SCREENS.abend = function (state, c) {
    var live = c.liveNight;
    var SH = window.SA_SHELL;

    // ── Kein laufender Abend ────────────────────────────────────────────────
    if (!live) {
      var next = c.nextNight;
      return [
        SH.ScreenHead({
          eyebrow: 'Abend läuft', title: 'Gerade nicht',
          sub: 'Kein Abend am Laufen. Verdächtig ruhig.',
          actions: U.Button({ children: 'Abend planen', iconLeft: 'plus', onClick: window.SA_DIALOGS.abendPlanen })
        }),
        U.Card({
          tone: 'sunken', padding: '0',
          children: h('div.sa-empty', null,
            U.Icon('flame', { size: 32, color: 'var(--text-faint)' }),
            h('span.sa-empty__text', next
              ? 'Der nächste ist ' + SA.fmtDateLong(next.date) + '. Bis dahin: üben.'
              : 'Nichts geplant, nichts gewonnen.'),
            next ? U.Button({
              children: 'Abend starten', iconLeft: 'play',
              onClick: function () {
                S.update(function (doc) {
                  var n = doc.nights.filter(function (x) { return x.id === next.id; })[0];
                  if (!n) return false;
                  n.status = 'laeuft'; n.runde = 1; n.runden = n.runden || 7; n.startedAt = S.uhr();
                }, {
                  summary: 'Abend „' + next.title + '" gestartet',
                  entries: [{ icon: 'play', tone: 'punsch', text: 'Abend „' + next.title + '" läuft.', to: S.uhr() }]
                });
              }
            }) : null)
        })
      ];
    }

    // ── Laufender Abend ─────────────────────────────────────────────────────
    var spiel = spielDesAbends(live);
    var stand = {};
    (spiel ? spiel.results || [] : []).forEach(function (r) { stand[r.playerId] = Number(r.score) || 0; });
    var strafen = {};
    (spiel ? spiel.results || [] : []).forEach(function (r) { if (r.strafe) strafen[r.playerId] = true; });

    var alle = S.affen('all', { includeEmpty: true });
    var dabei = alle.filter(function (a) { return (live.dabei || []).indexOf(a.id) >= 0; });
    if (!dabei.length) dabei = alle;

    var sortiert = dabei.slice().sort(function (a, b) { return (stand[b.id] || 0) - (stand[a.id] || 0); });
    var fuehrt = sortiert[0];
    var letzter = sortiert[sortiert.length - 1];
    var spruch = T.teaseRunde(fuehrt, letzter);
    var runde = live.runde || 1, runden = live.runden || 7;
    var d = dauer(live);

    var tabsHost = h('span');
    function zeichneTabs() {
      window.SA_DOM.mount(tabsHost, U.Tabs({
        variant: 'pill', value: ansicht,
        items: [{ id: 'runde', label: 'Runde' }, { id: 'gesamt', label: 'Gesamt' }],
        onChange: function (id) { ansicht = id; zeichneTabs(); zeichneZeilen(); }
      }));
    }
    var zeilenHost = h('div');
    function zeichneZeilen() {
      // „Gesamt" zeigt die Saisonpunkte, „Runde" den Stand im laufenden Spiel.
      var saisonPunkte = {};
      S.affen('all').forEach(function (a) { saisonPunkte[a.id] = a.points; });
      window.SA_DOM.mount(zeilenHost, dabei.map(function (a) {
        var wert = ansicht === 'gesamt' ? (saisonPunkte[a.id] || 0) : (stand[a.id] || 0);
        return h('div.sa-row', { style: a.you ? { background: 'var(--slime-900)' } : null },
          U.PlayerAvatar({ name: a.name, seat: a.seat, crown: fuehrt && a.id === fuehrt.id }),
          h('span', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 } },
            h('span.sa-strong.sa-truncate', a.name),
            strafen[a.id] ? U.Tease({ tone: 'burn', size: 'sm', children: 'Strafe kassiert.' }) : null),
          ansicht === 'runde' ? U.IconButton({
            icon: 'minus', label: a.name + ' minus fünf', variant: 'outline', size: 'sm',
            onClick: function () { bump(live, a.id, -5); }
          }) : null,
          h('span.sa-num', {
            style: {
              fontSize: '23px', minWidth: '62px', textAlign: 'center',
              color: fuehrt && a.id === fuehrt.id ? 'var(--slime-500)' : 'var(--text-strong)'
            }
          }, String(wert)),
          ansicht === 'runde' ? U.IconButton({
            icon: 'plus', label: a.name + ' plus fünf', variant: 'outline', size: 'sm',
            onClick: function () { bump(live, a.id, 5); }
          }) : null,
          ansicht === 'runde' ? U.Button({
            children: 'Strafe', size: 'sm', variant: 'ghost', iconLeft: 'skull',
            disabled: !!strafen[a.id],
            onClick: function () { strafe(live, a); }
          }) : null
        );
      }));
    }
    zeichneTabs();
    zeichneZeilen();

    function rundeAbschliessen() {
      if (runde >= runden) { abendBeenden(); return; }
      S.update(function (doc) {
        var n = doc.nights.filter(function (x) { return x.id === live.id; })[0];
        if (!n) return false;
        n.runde = (n.runde || 1) + 1;
      }, { summary: 'Runde ' + runde + ' abgeschlossen' })
        .then(function () { S.toast('Runde durch', 'Punkte stehen. Kein Zurück.', 'slime'); })
        .catch(function () { /* Meldung kam schon vom Store */ });
    }

    function abendBeenden() {
      var ev = SA.evalNight(live);
      var sieger = (ev.winners || []).map(function (pid) { return c.playerById[pid]; }).filter(Boolean);
      S.update(function (doc) {
        var n = doc.nights.filter(function (x) { return x.id === live.id; })[0];
        if (!n) return false;
        n.status = 'fertig';
      }, {
        summary: 'Abend „' + live.title + '" beendet',
        entries: [{
          icon: 'check', tone: 'banana',
          text: 'Abend „' + live.title + '" beendet.',
          to: sieger.length ? sieger.map(function (p) { return p.name; }).join(' & ') : '—'
        }]
      }).then(function () {
        S.toast('Abend durch', sieger.length
          ? sieger.map(function (p) { return p.name; }).join(' & ') + ' gewinnt. Der Rest übt.'
          : 'Steht alles im Block.', 'banana');
        S.navigate('uebersicht');
      }).catch(function () { /* Meldung kam schon vom Store */ });
    }

    return [
      SH.ScreenHead({
        eyebrow: 'Läuft gerade' + (spiel ? ' · ' + spiel.title : ''),
        title: live.title,
        sub: 'Punkte direkt nach der Runde eintragen, sonst streiten wir bis Mitternacht.',
        actions: [
          U.Button({ children: 'Abend beenden', variant: 'secondary', iconLeft: 'stop_circle', onClick: abendBeenden }),
          U.Button({ children: 'Runde abschließen', variant: 'live', iconLeft: 'check', onClick: rundeAbschliessen })
        ]
      }),
      h('div.sa-cols.sa-cols--side', null,
        U.Card({
          tone: 'live', padding: '0',
          children: [
            h('div.sa-card__head', { style: { alignItems: 'center' } },
              h('div.sa-inline', null,
                U.Badge({ children: 'Runde ' + runde, tone: 'punsch', dot: true }),
                fuehrt ? h('span.sa-body', fuehrt.name + ' führt mit ' + (stand[fuehrt.id] || 0)) : null,
                U.Tease({ tone: spruch.tone, size: 'sm', children: spruch.text })),
              tabsHost),
            h('div', { style: { padding: '0 var(--pad-card) var(--space-5)' } },
              U.ProgressBar({ value: runde, max: runden, valueLabel: runde + ' / ' + runden, tone: 'punsch', striped: true })),
            zeilenHost
          ]
        }),
        h('div.sa-stack', null,
          U.StatTile({ label: 'Dauer', value: d.value, unit: d.unit, icon: 'clock' }),
          U.Card({
            eyebrow: 'Abend', title: 'Einstellungen',
            children: [
              U.Select({
                label: 'Spiel', value: spiel ? spiel.gameId : '',
                options: c.shelf.map(function (g) { return { value: g.id, label: g.title }; }),
                onChange: function (e) {
                  var g = c.shelf.filter(function (x) { return x.id === e.target.value; })[0];
                  S.update(function (doc) {
                    var n = doc.nights.filter(function (x) { return x.id === live.id; })[0];
                    if (!n || !n.games || !n.games[0]) return false;
                    n.games[0].gameId = g.id;
                    n.games[0].title = g.title;
                    n.games[0].lowerWins = !!g.lowerWins;
                  }, { summary: 'Spiel auf ' + g.title + ' geändert' });
                }
              }),
              U.Select({
                label: 'Wertung', value: spiel && spiel.lowerWins ? 'lo' : 'hi',
                options: [{ value: 'hi', label: 'Höchste Punktzahl gewinnt' }, { value: 'lo', label: 'Niedrigste gewinnt' }],
                onChange: function (e) {
                  S.update(function (doc) {
                    var n = doc.nights.filter(function (x) { return x.id === live.id; })[0];
                    if (!n || !n.games || !n.games[0]) return false;
                    n.games[0].lowerWins = e.target.value === 'lo';
                  }, { summary: 'Wertung geändert' });
                }
              }),
              U.Select({
                label: 'Runden', value: String(runden),
                options: [3, 5, 7, 10, 13, 15, 20].map(function (n) { return { value: String(n), label: n + ' Runden' }; }),
                onChange: function (e) {
                  S.update(function (doc) {
                    var n = doc.nights.filter(function (x) { return x.id === live.id; })[0];
                    if (!n) return false;
                    n.runden = Number(e.target.value);
                    if (n.runde > n.runden) n.runde = n.runden;
                  }, { summary: 'Rundenzahl geändert' });
                }
              }),
              h('span.sa-meta', 'Eine Strafe kostet ' + SA.STRAFE_POINTS + ' Punkte. Steht so in der Engine.')
            ]
          }),
          hausregel(c)
        ))
    ];
  };

  function hausregel(c) {
    var regeln = (c.data.houseRules || []);
    if (!regeln.length) return null;
    var regel = regeln[new Date().getDate() % regeln.length];
    return U.Card({
      tone: 'sunken', eyebrow: 'Hausregel #' + regel.nr, title: regel.text,
      children: h('span.sa-body', 'Gilt für alle. Besonders für den, der gerade widerspricht.')
    });
  }
})();
