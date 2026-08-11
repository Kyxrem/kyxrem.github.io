/* SpieleAffen — Spiele.
 * Aus ui_kits/dashboard/GamesScreen.jsx: das Regal mit Genre-Pillen, Suche und
 * dem Schalter „nur selten gespielt". Spiele mit eigenem Modul tragen ein
 * Modul-Abzeichen, das direkt hineinspringt.
 */
(function () {
  'use strict';
  var h = window.h, U = window.SA_UI, SA = window.SA, S = window.SA_STORE, T = window.SA_TEASE;

  var genre = 'alle';
  var selten = false;

  /* Das Suchfeld wird einmal gebaut und danach nur noch umgehängt — sonst
     verliert es bei jedem Tastendruck den Fokus. Sein Listener hängt genau
     einmal dran, darf aber nicht die Zeichenfunktion des ersten Aufbaus
     festhalten: nach einem Screenwechsel wäre das ein toter Knoten. Deshalb
     ruft er das, was gerade gilt. */
  var suchFeld = null;
  var zeichneAktuell = function () {};

  function filtern(shelf) {
    var q = (suchFeld && suchFeld.input.value || '').trim().toLowerCase();
    return shelf.filter(function (g) {
      if (genre !== 'alle' && g.genre !== genre) return false;
      if (selten && g.plays > 2) return false;
      if (q && g.title.toLowerCase().indexOf(q) < 0 && g.genre.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }

  function karte(g) {
    var spruch = T.teaseSpiel(g);
    var meta = [g.dauerMin ? g.dauerMin + ' min' : null,
                g.minAffen ? g.minAffen + '–' + g.maxAffen + ' Affen' : null,
                g.lowerWins ? 'weniger gewinnt' : null].filter(Boolean).join(' · ');

    return U.Card({
      interactive: true,
      onClick: function () { window.SA_DIALOGS.ergebnisEintragen({ gameId: g.id }); },
      children: [
        h('div.sa-card__head', null,
          h('div.sa-card__heading', null,
            h('span.sa-card__eyebrow', g.genre),
            h('h3.sa-card__title', g.title)),
          g.modul ? U.Badge({
            children: 'Modul', tone: 'slime', size: 'sm', icon: 'extension'
          }) : null),
        h('span.sa-meta', meta),
        U.Tease({ tone: spruch.tone, size: 'sm', children: spruch.text }),
        h('div', { style: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 'var(--space-5)', marginTop: 'auto' } },
          h('span', { style: { display: 'flex', flexDirection: 'column', gap: '1px' } },
            h('span.sa-eyebrow', 'Gespielt'),
            h('span.sa-num', { style: { fontSize: '23px' } }, String(g.plays))),
          g.modul ? U.Button({
            children: 'Modul öffnen', size: 'sm', variant: 'secondary', iconRight: 'chevron-right',
            onClick: function (e) { e.stopPropagation(); window.SA_SCREENS.module.oeffne(g.modul); }
          }) : U.Button({
            children: 'Eintragen', size: 'sm', variant: 'ghost', iconLeft: 'edit_note',
            onClick: function (e) { e.stopPropagation(); window.SA_DIALOGS.ergebnisEintragen({ gameId: g.id }); }
          }))
      ]
    });
  }

  window.SA_SCREENS = window.SA_SCREENS || {};
  window.SA_SCREENS.spiele = function (state, c) {
    var SH = window.SA_SHELL;
    var shelf = c.shelf;
    var genres = ['alle'].concat(shelf.map(function (g) { return g.genre; })
      .filter(function (x, i, arr) { return arr.indexOf(x) === i; }).sort());

    if (!suchFeld) {
      suchFeld = U.Input({ placeholder: 'Spiel suchen …', icon: 'search' });
      suchFeld.style.minWidth = '220px';
      suchFeld.input.addEventListener('input', function () { zeichneAktuell(); });
    }

    var pillenHost = h('span');
    var schalterHost = h('span');
    var regalHost = h('div');

    function zeichnePillen() {
      window.SA_DOM.mount(pillenHost, U.Tabs({
        variant: 'pill', value: genre,
        items: genres.map(function (x) {
          return { id: x, label: x === 'alle' ? 'Alle' : x, count: x === 'alle' ? shelf.length : shelf.filter(function (g) { return g.genre === x; }).length };
        }),
        onChange: function (id) { genre = id; zeichnePillen(); zeichneRegal(); }
      }));
    }
    function zeichneSchalter() {
      window.SA_DOM.mount(schalterHost, U.Switch({
        label: 'nur selten gespielt', checked: selten,
        onChange: function (e) { selten = e.target.checked; zeichneSchalter(); zeichneRegal(); }
      }));
    }
    function zeichneRegal() {
      var treffer = filtern(shelf);
      window.SA_DOM.mount(regalHost, treffer.length
        ? h('div.sa-shelf', treffer.map(karte))
        : U.Card({
            padding: '0', tone: 'sunken',
            children: h('div.sa-empty', null,
              U.Icon('dices', { size: 32, color: 'var(--text-faint)' }),
              h('span.sa-empty__text', 'Nichts gefunden. Tipp: weniger tippen, mehr spielen.'),
              U.Button({
                children: 'Filter zurücksetzen', size: 'sm', variant: 'ghost', iconLeft: 'undo',
                onClick: function () {
                  genre = 'alle'; selten = false; suchFeld.input.value = '';
                  zeichnePillen(); zeichneSchalter(); zeichneRegal();
                }
              }))
          }));
    }
    zeichneAktuell = zeichneRegal;
    zeichnePillen();
    zeichneSchalter();
    zeichneRegal();

    return [
      SH.ScreenHead({
        eyebrow: 'Regal',
        title: 'Spiele',
        sub: shelf.length + ' Spiele im Schrank. Manche davon sogar gespielt.',
        actions: U.Button({ children: 'Abend planen', iconLeft: 'plus', onClick: window.SA_DIALOGS.abendPlanen })
      }),
      h('div.sa-inline.sa-section-gap', { style: { justifyContent: 'space-between' } },
        pillenHost,
        h('div.sa-inline', null, suchFeld, schalterHost)),
      regalHost
    ];
  };
})();
