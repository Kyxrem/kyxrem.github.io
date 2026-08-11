/* SpieleAffen — Übersicht.
 * Aus ui_kits/dashboard/OverviewScreen.jsx: Kennzahlen-Reihe, die neonumrandete
 * Karte für den laufenden Abend, letzte Abende, Rangliste-Vorschau, Snack-Liste.
 * Dazu die Rekorde aus der Vorgänger-App.
 *
 * Eine laute Slime-Fläche pro Screen: das ist hier die „Läuft gerade"-Karte.
 * Punsch nur, solange wirklich etwas läuft.
 */
(function () {
  'use strict';
  var h = window.h, U = window.SA_UI, SA = window.SA, S = window.SA_STORE, T = window.SA_TEASE;

  function kennzahlen(c, affen, me) {
    var ich = me ? affen.filter(function (a) { return a.id === me.id; })[0] : null;
    var abende = c.playedNights.length;
    var imMonat = c.playedNights.filter(function (n) { return SA.monthKey(n.date) === SA.monthKey(S.heute()); }).length;
    var beste = affen.slice().sort(function (a, b) { return b.bestStreak - a.bestStreak; })[0];
    var strafen = affen.reduce(function (s, a) { return s + a.strafen; }, 0);

    return [
      U.StatTile({
        label: 'Abende gespielt', value: abende, icon: 'calendar-days',
        delta: imMonat ? '+' + imMonat + ' diesen Monat' : null
      }),
      U.StatTile({
        label: ich ? 'Deine Siege' : 'Abendsiege', tone: 'slime', icon: 'trophy',
        value: ich ? ich.wins : affen.reduce(function (s, a) { return s + a.wins; }, 0),
        unit: ich ? '/ ' + ich.nights : null
      }),
      U.StatTile({
        label: 'Längste Serie', tone: 'banana', icon: 'flame',
        value: beste ? beste.bestStreak : 0, unit: beste && beste.bestStreak === 1 ? 'Abend' : 'Abende',
        delta: beste && beste.bestStreak ? beste.name + ', natürlich' : null
      }),
      U.StatTile({
        label: 'Strafrunden', tone: strafen ? 'punsch' : 'neutral', icon: 'skull',
        value: strafen, delta: strafen ? 'Selbst schuld' : 'Noch sauber',
        deltaDirection: strafen ? 'down' : 'up'
      })
    ];
  }

  function laufenderAbend(c, affen) {
    var live = c.liveNight;
    if (!live) {
      var next = c.nextNight;
      return U.Card({
        tone: 'sunken', eyebrow: next ? 'Als Nächstes' : 'Nichts los',
        title: next ? next.title : 'Kein Abend geplant',
        children: [
          h('span.sa-body', next
            ? SA.fmtDateLong(next.date) + (next.zeit ? ', ' + next.zeit : '') + ' · ' + (next.dabei || []).length + ' Affen zugesagt.'
            : 'Kein Termin, keine Punkte, keine Ausreden. Auffällig ruhig hier.'),
          h('div.sa-inline', null,
            U.Button({ children: 'Abend planen', iconLeft: 'plus', onClick: window.SA_DIALOGS.abendPlanen }),
            next ? U.Button({
              children: 'Abend starten', variant: 'secondary', iconLeft: 'play',
              onClick: function () {
                S.update(function (doc) {
                  var n = doc.nights.filter(function (x) { return x.id === next.id; })[0];
                  if (!n) return false;
                  n.status = 'laeuft';
                  n.runde = 1;
                  n.runden = n.runden || 7;
                  n.startedAt = S.uhr();
                }, {
                  summary: 'Abend „' + next.title + '" gestartet',
                  entries: [{ icon: 'play', tone: 'punsch', text: 'Abend „' + next.title + '" läuft.', to: S.uhr() }]
                }).then(function () { S.navigate('abend'); });
              }
            }) : null)
        ]
      });
    }

    var spiel = (live.games || [])[0] || {};
    var stand = {};
    (spiel.results || []).forEach(function (r) { stand[r.playerId] = Number(r.score) || 0; });
    var dabei = affen.filter(function (a) { return (live.dabei || []).indexOf(a.id) >= 0; });
    var fuehrt = dabei.slice().sort(function (a, b) { return (stand[b.id] || 0) - (stand[a.id] || 0); })[0];
    var runde = live.runde || 1, runden = live.runden || 7;

    return U.Card({
      tone: 'neon',
      eyebrow: 'Läuft gerade',
      title: (spiel.title || live.title) + ' · Runde ' + runde + ' von ' + runden,
      action: U.Badge({ children: 'live', tone: 'punsch', dot: true }),
      children: [
        h('div.sa-inline', null,
          dabei.slice(0, 6).map(function (a) {
            return U.PlayerAvatar({ name: a.name, seat: a.seat, crown: fuehrt && a.id === fuehrt.id });
          }),
          fuehrt ? h('span.sa-body', fuehrt.name + ' führt mit ' + (stand[fuehrt.id] || 0) + '.') : null),
        U.ProgressBar({ value: runde, max: runden, label: 'Runde', valueLabel: runde + ' / ' + runden, striped: true }),
        h('div.sa-inline', null,
          U.Button({ children: 'Punkte eintragen', variant: 'live', iconLeft: 'pencil', onClick: function () { S.navigate('abend'); } }),
          U.Button({ children: 'Abend öffnen', variant: 'ghost', iconRight: 'chevron-right', onClick: function () { S.navigate('abend'); } }))
      ]
    });
  }

  function letzteAbende(c) {
    var abende = c.nightInfos.slice(-5).reverse();
    return U.Card({
      padding: '0',
      title: 'Letzte Abende',
      action: U.IconButton({ icon: 'ellipsis', label: 'Alle Abende', size: 'sm', onClick: function () { S.navigate('rangliste'); } }),
      children: abende.length ? abende.map(function (info) {
        var sieger = info.eval.winners.map(function (pid) { return c.playerById[pid]; }).filter(Boolean)[0];
        var titel = (info.night.games || []).map(function (g) { return g.title; }).join(' · ');
        var punkte = sieger ? info.eval.per[sieger.id].total : 0;
        return h('div.sa-row', null,
          h('span.sa-meta.sa-meta--mono', { style: { width: '84px', flex: '0 0 auto' } }, SA.fmtDateLong(info.night.date)),
          h('span', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 } },
            h('span.sa-strong.sa-truncate', titel || info.night.title),
            U.Tease({ tone: 'brag', size: 'sm', icon: null, children: (sieger ? sieger.name : 'Niemand') + ' hat’s genommen.' })),
          sieger ? U.Tag({ children: sieger.name, color: U.seatVar(sieger.seat), size: 'sm' }) : null,
          h('span.sa-num', { style: { width: '44px', textAlign: 'right', fontSize: '16px' } }, U.num(punkte))
        );
      }) : h('div.sa-empty', null,
        U.Icon('calendar-days', { size: 32, color: 'var(--text-faint)' }),
        h('span.sa-empty__text', 'Noch kein Abend gespielt. Sehr mutig.'))
    });
  }

  function ranglisteVorschau(c, affen) {
    var urteil = T.teaseRang(affen);
    var saison = c.currentSeason;
    return U.Card({
      padding: '0',
      children: [
        h('div.sa-card__head', null,
          h('div.sa-card__heading', null,
            h('h3.sa-h3', 'Rangliste'),
            U.Tease({ tone: urteil.tone, size: 'sm', children: urteil.text })),
          U.Badge({ children: saison ? saison.name.replace(/ ·.*$/, '') : 'Ewig' })),
        affen.length ? affen.slice(0, 4).map(function (a, i) {
          var spruch = T.teaseSpieler(a, a.place, affen.length);
          return U.ScoreRow({
            rank: a.place, name: a.name, seat: a.seat, points: a.points, delta: a.delta,
            meta: spruch.text, highlight: a.you,
            badge: a.streak >= 4 ? U.Tooltip({
              label: a.streak + ' Abende ungeschlagen',
              children: U.Badge({ children: String(a.streak), tone: 'banana', size: 'sm', icon: 'flame' })
            }) : null,
            onClick: function () { S.navigate('rangliste'); }
          });
        }) : h('div.sa-empty', null, h('span.sa-empty__text', 'Noch niemand. Sehr mutig.'))
      ]
    });
  }

  function snackListe(c) {
    var abend = c.liveNight || c.nextNight;
    if (!abend) return null;
    var snacks = abend.snacks && abend.snacks.length ? abend.snacks : window.SA_DIALOGS.standardSnacks();
    var gedeckt = snacks.filter(function (s) { return s.ok; }).length;
    var me = S.get().me;

    return U.Card({
      eyebrow: c.liveNight ? 'Heute Abend' : SA.fmtDateLong(abend.date),
      title: 'Wer bringt was mit?',
      children: [
        U.ProgressBar({ value: gedeckt, max: snacks.length, tone: 'banana', label: 'Abgedeckt', valueLabel: gedeckt + ' / ' + snacks.length }),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', marginTop: '2px' } },
          snacks.map(function (s) {
            return U.Checkbox({
              checked: s.ok,
              label: h('span', null, h('strong', { style: { fontWeight: 600, color: 'var(--text-strong)' } }, s.was),
                s.wer ? ' · ' + s.wer : ''),
              hint: s.ok ? undefined : 'Noch niemand. Sehr mutig.',
              onChange: function () {
                S.update(function (doc) {
                  var n = doc.nights.filter(function (x) { return x.id === abend.id; })[0];
                  if (!n) return false;
                  n.snacks = (n.snacks && n.snacks.length ? n.snacks : window.SA_DIALOGS.standardSnacks()).map(function (x) {
                    return x.was === s.was ? { was: x.was, ok: !x.ok, wer: x.ok ? null : (me ? me.name : 'Jemand') } : x;
                  });
                }, { summary: s.was + (s.ok ? ' abgemeldet' : ' übernommen') });
              }
            });
          }))
      ]
    });
  }

  function rekorde(c) {
    var r = c.records;
    var zeilen = [];
    if (r.bestNightPoints) {
      zeilen.push(['Bester Abend', (c.playerById[r.bestNightPoints.playerId] || {}).name, r.bestNightPoints.points + ' Pkt', SA.fmtDate(r.bestNightPoints.date)]);
    }
    if (r.bestStreak) {
      zeilen.push(['Längste Serie', (c.playerById[r.bestStreak.playerId] || {}).name, r.bestStreak.len + ' Siege', 'in Folge']);
    }
    if (r.longestGameMin) {
      zeilen.push(['Längste Partie', r.longestGameMin.title, r.longestGameMin.min + ' min', SA.fmtDate(r.longestGameMin.date)]);
    }
    var titel = Object.keys(r.bestScoreByTitle)[0];
    if (titel) {
      var rec = r.bestScoreByTitle[titel];
      zeilen.push(['Bestwert ' + titel, (c.playerById[rec.playerId] || {}).name, String(rec.score), SA.fmtDate(rec.date)]);
    }
    if (!zeilen.length) return null;

    return U.Card({
      padding: '0', title: 'Rekorde',
      action: U.Badge({ children: String(zeilen.length), size: 'sm' }),
      children: zeilen.map(function (z) {
        return h('div.sa-row', null,
          h('span', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 } },
            h('span.sa-eyebrow', z[0]),
            h('span.sa-strong.sa-truncate', z[1] || '—')),
          h('span', { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1px' } },
            h('span.sa-num', { style: { fontSize: '16px' } }, z[2]),
            h('span.sa-meta', z[3])));
      })
    });
  }

  window.SA_SCREENS = window.SA_SCREENS || {};
  window.SA_SCREENS.uebersicht = function (state, c) {
    var affen = S.affen('all');
    var saison = c.currentSeason;

    return [
      window.SA_SHELL.ScreenHead({
        eyebrow: SA.fmtDateLong(S.heute()),
        title: 'Übersicht',
        sub: affen.length
          ? SA.plural(affen.length, 'Affe', 'Affen') + ', ' + SA.plural(c.shelf.length, 'Spiel', 'Spiele') + ', keine Ausreden.'
          : 'Noch keine Affen im Block. Das wird ein kurzer Abend.',
        actions: [
          U.Button({ children: 'Ergebnis eintragen', variant: 'secondary', iconLeft: 'dices', onClick: function () { window.SA_DIALOGS.ergebnisEintragen(); } }),
          U.Button({ children: 'Abend planen', iconLeft: 'plus', onClick: window.SA_DIALOGS.abendPlanen })
        ]
      }),
      h('div.sa-stats', kennzahlen(c, affen, state.me)),
      h('div.sa-cols.sa-cols--wide', null,
        h('div.sa-stack', null, laufenderAbend(c, affen), letzteAbende(c)),
        h('div.sa-stack', null, ranglisteVorschau(c, affen), snackListe(c), rekorde(c)))
    ];
  };
})();
