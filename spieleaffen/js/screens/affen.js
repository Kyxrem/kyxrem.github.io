/* SpieleAffen — Affen.
 * Aus ui_kits/dashboard/PlayersScreen.jsx: die volle Statistik-Tabelle mit
 * einem Spruch je Affe, eine Urteil-Karte und der Weg zu „Ergebnis eintragen".
 * Dazu der Angstgegner aus der Vorgänger-App.
 */
(function () {
  'use strict';
  var h = window.h, U = window.SA_UI, SA = window.SA, S = window.SA_STORE, T = window.SA_TEASE;

  var SPALTEN = '1.6fr 84px 76px 68px 72px 68px';

  function tabelle(c, affen) {
    return U.Card({
      padding: '0',
      children: [
        h('div.sa-card__head', null,
          h('div.sa-card__heading', null,
            h('h3.sa-h3', 'Alle Affen'),
            h('span.sa-meta', SA.plural(affen.length, 'Affe', 'Affen') + ' aktiv · Sitzfarbe je einmal, tauschbar im Admin'))),
        /* „Ergebnis eintragen" steht im Kopf der Seite — nicht zwei Zeilen
           darunter noch einmal. */
        h('div.sa-scrollx', null, h('div', null,
          h('div.sa-thead', { style: { gridTemplateColumns: SPALTEN } },
            h('span', 'Affe'), h('span', 'Punkte'), h('span', 'Abende'),
            h('span', 'Siege'), h('span', 'Quote'), h('span', 'Serie')),
          affen.length ? affen.map(function (a) {
            var spruch = T.teaseSpieler(a, a.place, affen.length);
            return h('div.sa-trow', { style: { gridTemplateColumns: SPALTEN } },
              h('span.sa-inline', { style: { gap: 'var(--space-5)', flexWrap: 'nowrap', minWidth: 0 } },
                U.PlayerAvatar({ name: a.name, seat: a.seat, crown: a.place === 1 }),
                h('span', { style: { display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 } },
                  h('span.sa-strong.sa-truncate', a.name + (a.you ? ' · Du' : '')),
                  U.Tease({ tone: spruch.tone, size: 'sm', icon: null, children: spruch.text }))),
              h('span.sa-num', { style: { fontSize: '19px' } }, U.num(a.points)),
              h('span.sa-num', { style: { fontSize: '14px', color: 'var(--text-muted)' } }, String(a.nights)),
              h('span.sa-num', { style: { fontSize: '14px', color: 'var(--text-muted)' } }, String(a.wins)),
              h('span.sa-num', { style: { fontSize: '14px', color: 'var(--text-muted)' } }, a.quote + '%'),
              a.streak
                ? U.Badge({ children: String(a.streak), tone: 'banana', size: 'sm', icon: 'flame' })
                : h('span.sa-meta.sa-meta--mono', '—'));
          }) : h('div.sa-empty', null,
            U.Icon('users', { size: 32, color: 'var(--text-faint)' }),
            // Der Knopf steht eine Handbreit darüber im Kopf der Seite.
            h('span.sa-empty__text', 'Noch niemand. Sehr mutig.')))
        )
      ]
    });
  }

  /* Die Urteil-Karte liest die Tabelle laut vor — eine Zeile, kein Absatz. */
  function urteil(affen) {
    if (affen.length < 2) return null;
    var erster = affen[0], letzter = affen[affen.length - 1];
    var abstand = erster.points - affen[1].points;
    var beste = affen.slice().sort(function (a, b) { return b.quote - a.quote; })[0];
    var spruch = T.teaseRang(affen);

    return U.Card({
      tone: 'neon', eyebrow: 'Urteil', title: 'Steht so im Block',
      children: [
        U.Tease({ tone: spruch.tone, children: spruch.text }),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' } },
          zeile('Führt', erster.name, erster.points + ' Pkt'),
          zeile('Abstand auf Platz 2', abstand > 0 ? abstand + ' Punkte' : 'keiner', abstand > 0 ? '' : 'Gleichstand'),
          zeile('Beste Quote', beste.name, beste.quote + '%'),
          zeile('Hält die Laterne', letzter.name, letzter.points + ' Pkt'))
      ]
    });
  }

  function zeile(label, wert, zusatz) {
    return h('div', { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-5)' } },
      h('span.sa-eyebrow', label),
      h('span', { style: { display: 'flex', alignItems: 'baseline', gap: 'var(--space-4)' } },
        h('span.sa-strong', wert),
        zusatz ? h('span.sa-meta.sa-meta--mono', zusatz) : null));
  }

  /* Angstgegner: wer schlägt mich auffällig oft? Braucht mindestens vier
     gemeinsame Spiele, damit ein Zufall nicht als Trauma durchgeht. */
  function angstgegner(c, affen) {
    var zeilen = affen.map(function (a) {
      var n = c.nemesisOf(a.id);
      if (!n) return null;
      var gegner = c.playerById[n.playerId];
      if (!gegner) return null;
      return h('div.sa-row', null,
        U.PlayerAvatar({ name: a.name, seat: a.seat, size: 'sm' }),
        h('span', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 } },
          h('span.sa-strong.sa-truncate', a.name + ' verliert gegen ' + gegner.name),
          h('span.sa-meta', n.worstTitle ? 'Besonders bei ' + n.worstTitle.title + '.' : 'Quer durchs Regal.')),
        h('span.sa-num', { style: { fontSize: '16px', color: 'var(--punsch-400)' } }, Math.round(n.rate * 100) + '%'));
    }).filter(Boolean);

    if (!zeilen.length) return null;
    return U.Card({
      padding: '0', title: 'Angstgegner',
      action: U.Badge({ children: String(zeilen.length), size: 'sm', tone: 'punsch' }),
      children: zeilen
    });
  }

  function proSpiel(c, affen) {
    var titel = Object.keys(c.perGame).sort(function (a, b) { return c.perGame[b].plays - c.perGame[a].plays; }).slice(0, 5);
    if (!titel.length) return null;
    return U.Card({
      padding: '0', title: 'Wer kann was',
      children: titel.map(function (t) {
        var pg = c.perGame[t];
        var best = Object.keys(pg.byPlayer).sort(function (x, y) { return pg.byPlayer[y].wins - pg.byPlayer[x].wins; })[0];
        var p = c.playerById[best];
        return h('div.sa-row', null,
          h('span', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 } },
            h('span.sa-strong.sa-truncate', t),
            h('span.sa-meta', pg.plays + '× gespielt')),
          p ? U.Tag({ children: p.name, color: U.seatVar(p.seat), size: 'sm' }) : null,
          h('span.sa-num', { style: { fontSize: '16px', minWidth: '28px', textAlign: 'right' } },
            best ? String(pg.byPlayer[best].wins) : '0'));
      })
    });
  }

  window.SA_SCREENS = window.SA_SCREENS || {};
  window.SA_SCREENS.affen = function (state, c) {
    var affen = S.affen('all', { includeEmpty: true });
    var SH = window.SA_SHELL;

    return [
      SH.ScreenHead({
        eyebrow: 'Affen',
        title: 'Alle Affen',
        sub: affen.length
          ? 'Punkte, Quote, Serie — und was die Zahlen über euch sagen.'
          : 'Noch keine Affen. Erst anlegen, dann verlieren.',
        actions: [
          U.Button({ children: 'Affe hinzufügen', variant: 'secondary', iconLeft: 'user-plus', onClick: window.SA_DIALOGS.affeHinzufuegen }),
          U.Button({ children: 'Ergebnis eintragen', iconLeft: 'edit_note', onClick: function () { window.SA_DIALOGS.ergebnisEintragen(); } })
        ]
      }),
      h('div.sa-cols.sa-cols--admin', null,
        tabelle(c, affen),
        h('div.sa-stack', null, urteil(affen), angstgegner(c, affen), proSpiel(c, affen)))
    ];
  };
})();
