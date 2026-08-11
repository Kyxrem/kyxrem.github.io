/* SpieleAffen — Rangliste.
 * Aus ui_kits/dashboard/LeaderboardScreen.jsx: Saison-/Monats-/Ewig-Reiter, die
 * volle ScoreRow-Liste, Abstandsbalken zur Spitze.
 *
 * Vierter Reiter: Pokale. Das UI-Kit sieht sieben Navigationspunkte vor und die
 * Seitenleiste ist fester Teil der Schale — deshalb sitzen die Auszeichnungen
 * der Vorgänger-App hier als Reiter statt als achter Menüpunkt.
 */
(function () {
  'use strict';
  var h = window.h, U = window.SA_UI, SA = window.SA, S = window.SA_STORE, T = window.SA_TEASE;

  var reiter = 'saison';
  var saisonId = null;
  var monatKey = null;

  function scopeKey(c) {
    if (reiter === 'monat') return 'm:' + (monatKey || c.months[0] || SA.monthKey(S.heute()));
    if (reiter === 'saison') return (saisonId || (c.currentSeason && c.currentSeason.id) || 'all');
    return 'all';
  }

  function liste(c, affen) {
    return U.Card({
      padding: '0',
      children: [
        h('div.sa-card__head', null,
          h('div.sa-card__heading', null,
            h('h3.sa-h3', bereichName(c)),
            affen.length ? U.Tease({ tone: T.teaseRang(affen).tone, size: 'sm', children: T.teaseRang(affen).text }) : null),
          U.Badge({ children: SA.plural(affen.length, 'Affe', 'Affen'), size: 'sm' })),
        affen.length ? affen.map(function (a) {
          var spruch = T.teaseSpieler(a, a.place, affen.length);
          return U.ScoreRow({
            rank: a.place, name: a.name, seat: a.seat, points: a.points, delta: a.delta,
            meta: spruch.text, highlight: a.you,
            badge: a.streak >= 2 ? U.Tooltip({
              label: a.streak + ' Abende ungeschlagen',
              children: U.Badge({ children: String(a.streak), tone: 'banana', size: 'sm', icon: 'flame' })
            }) : null
          });
        }) : h('div.sa-empty', null,
          U.Icon('trophy', { size: 32, color: 'var(--text-faint)' }),
          h('span.sa-empty__text', 'In diesem Zeitraum wurde nicht gespielt. Auch eine Aussage.'))
      ]
    });
  }

  function bereichName(c) {
    if (reiter === 'monat') return SA.monthName(monatKey || c.months[0] || SA.monthKey(S.heute()));
    if (reiter === 'ewig') return 'Ewige Tabelle';
    var s = (c.seasons || []).filter(function (x) { return x.id === scopeKey(c); })[0];
    return s ? s.name : 'Saison';
  }

  /* Abstand zur Spitze — der Balken zeigt, wie viel vom Führenden noch fehlt. */
  function abstand(affen) {
    if (affen.length < 2) return null;
    var spitze = affen[0].points || 1;
    return U.Card({
      eyebrow: 'Abstand', title: 'Wie weit nach oben?',
      children: affen.slice(0, 8).map(function (a) {
        var fehlt = affen[0].points - a.points;
        return U.ProgressBar({
          value: Math.max(0, a.points), max: Math.max(1, spitze),
          tone: a.place === 1 ? 'slime' : a.you ? 'banana' : 'eis',
          label: a.name, valueLabel: fehlt ? '−' + fehlt : 'führt'
        });
      })
    });
  }

  function statusKarte(c) {
    var rows = c.table(scopeKey(c));
    var lines = SA.statusLines(c, rows);
    var eintraege = Object.keys(lines);
    if (!eintraege.length) return null;
    return U.Card({
      padding: '0', title: 'Auffällig',
      children: eintraege.map(function (pid) {
        var p = c.playerById[pid];
        var l = lines[pid];
        return h('div.sa-row', null,
          U.PlayerAvatar({ name: p.name, seat: p.seat, size: 'sm' }),
          h('span.sa-strong', { style: { flex: 1 } }, p.name),
          U.Badge({
            children: l.text, size: 'sm',
            tone: l.tone === 'up' ? 'slime' : l.tone === 'down' ? 'punsch' : 'neutral'
          }));
      })
    });
  }

  // ── Pokale ────────────────────────────────────────────────────────────────
  function pokale(c) {
    var affen = S.affen('all', { includeArchived: true, includeEmpty: true });
    var karten = c.achievements.map(function (a) {
      var traeger = affen.filter(function (x) { return c.achState[x.id] && c.achState[x.id][a.id]; });
      return U.Card({
        tone: traeger.length ? 'default' : 'sunken',
        children: [
          h('div.sa-inline', { style: { gap: 'var(--space-5)', flexWrap: 'nowrap' } },
            h('span.sa-log__icon', {
              style: { '--sa-log-color': traeger.length ? (a.tone === 'punsch' ? 'var(--punsch-500)' : 'var(--banana-500)') : 'var(--line-strong)', width: '34px', height: '34px' }
            }, U.Icon(a.icon, { size: 18 })),
            h('span', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 } },
              h('span.sa-strong', a.name),
              h('span.sa-meta', a.desc))),
          traeger.length
            ? h('div.sa-inline', { style: { gap: 'var(--space-4)' } }, traeger.map(function (x) {
                return U.Tooltip({
                  label: x.name + ' · ' + SA.fmtDate(c.achState[x.id][a.id].date),
                  children: U.PlayerAvatar({ name: x.name, seat: x.seat, size: 'sm' })
                });
              }))
            : h('span.sa-meta', 'Noch niemand. Es wartet.')
        ]
      });
    });

    var letzte = c.unlockEvents.slice(0, 8);
    return [
      h('div.sa-shelf.sa-section-gap', karten),
      letzte.length ? U.Card({
        padding: '0', title: 'Zuletzt freigeschaltet',
        children: letzte.map(function (e) {
          var p = c.playerById[e.playerId];
          var a = c.achievements.filter(function (x) { return x.id === e.achId; })[0];
          if (!p || !a) return null;
          return U.LogEntry({
            icon: a.icon, tone: a.tone, actor: p.name, time: SA.fmtDate(e.date),
            text: p.name + ' hat „' + a.name + '" geholt. ' + a.desc + '.'
          });
        }).filter(Boolean)
      }) : null
    ];
  }

  window.SA_SCREENS = window.SA_SCREENS || {};
  window.SA_SCREENS.rangliste = function (state, c) {
    var SH = window.SA_SHELL;
    if (!saisonId && c.currentSeason) saisonId = c.currentSeason.id;
    if (!monatKey && c.months.length) monatKey = c.months[0];

    var reiterRow = U.Tabs({
      value: reiter,
      items: [
        { id: 'saison', label: 'Saison' },
        { id: 'monat', label: 'Monat' },
        { id: 'ewig', label: 'Ewig' },
        { id: 'pokale', label: 'Pokale', count: c.unlockEvents.length }
      ],
      onChange: function (id) { reiter = id; S.emit(); }
    });

    var unterwahl = null;
    if (reiter === 'saison' && c.seasons.length > 1) {
      unterwahl = U.Tabs({
        variant: 'pill', value: saisonId,
        items: c.seasons.map(function (s) { return { id: s.id, label: s.name.replace(/^Saison /, 'S').replace(/ ·.*$/, '') }; }),
        onChange: function (id) { saisonId = id; S.emit(); }
      });
    }
    if (reiter === 'monat' && c.months.length > 1) {
      unterwahl = U.Tabs({
        variant: 'pill', value: monatKey,
        items: c.months.slice(0, 8).map(function (m) { return { id: m, label: SA.monthName(m).slice(0, 3) + ' ' + m.slice(2, 4) }; }),
        onChange: function (id) { monatKey = id; S.emit(); }
      });
    }

    var affen = reiter === 'pokale' ? [] : S.affen(scopeKey(c));

    return [
      SH.ScreenHead({
        eyebrow: 'Rangliste',
        title: reiter === 'pokale' ? 'Pokale' : 'Wer führt',
        sub: reiter === 'pokale'
          ? 'Fünfzehn Auszeichnungen. Zwei davon will niemand.'
          : 'Punkte kommen aus Platzierung, Antreten, Tipps — und gehen bei Strafen wieder weg.',
        actions: U.Button({ children: 'Ergebnis eintragen', variant: 'secondary', iconLeft: 'edit_note', onClick: function () { window.SA_DIALOGS.ergebnisEintragen(); } })
      }),
      h('div.sa-stack.sa-section-gap', null, reiterRow, unterwahl),
      reiter === 'pokale'
        ? pokale(c)
        : h('div.sa-cols.sa-cols--side', null,
            liste(c, affen),
            h('div.sa-stack', null, abstand(affen), statusKarte(c), punkteLegende()))
    ];
  };

  function punkteLegende() {
    return U.Card({
      tone: 'sunken', eyebrow: 'Wie es zählt', title: 'Die Rechnung',
      children: h('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' } },
        [['Platz 1 / 2 / 3', '5 / 3 / 1'], ['Angetreten', '+1'], ['Bester Tipp', '+3'], ['Strafe', '−' + SA.STRAFE_POINTS]]
          .map(function (z) {
            return h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: 'var(--space-5)' } },
              h('span.sa-body', z[0]), h('span.sa-num', { style: { fontSize: '14px' } }, z[1]));
          }))
    });
  }
})();
