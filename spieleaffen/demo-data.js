/* SpieleAffen — Demo-Daten.
 *
 * Läuft, solange in config.js kein apiBase steht. Alles hier ist erfunden und
 * wird beim ersten echten Abend überschrieben — die Zahlen sind nur da, damit
 * jeder Screen etwas zu zeigen hat.
 *
 * Deterministisch: ein Seed, ein linearer Kongruenzgenerator, immer dieselben
 * Abende. Kein Math.random(), damit die Sprüche und Tabellen sich nicht bei
 * jedem Reload ändern.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SA_DEMO_DATA = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Linearer Kongruenzgenerator (numerical recipes) — reicht für Demo-Zahlen.
  var seed = 20260811;
  function rnd() { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }
  function int(min, max) { return min + Math.floor(rnd() * (max - min + 1)); }
  function pickOne(list) { return list[int(0, list.length - 1)]; }

  var PLAYERS = [
    { id: 'maik',   name: 'Maik',   short: 'MK', seat: 1, admin: true },
    { id: 'mattes', name: 'Mattes', short: 'MA', seat: 2 },
    { id: 'bene',   name: 'Bene',   short: 'BE', seat: 3 },
    { id: 'torben', name: 'Torben', short: 'TO', seat: 4 },
    { id: 'benni',  name: 'Benni',  short: 'BN', seat: 5 },
    { id: 'tobi',   name: 'Tobi',   short: 'TB', seat: 6, archived: true }
  ];

  var SEASONS = [
    { id: 's1', name: 'Saison 1 · Winter 26',   start: '2026-01-01', end: '2026-02-28' },
    { id: 's2', name: 'Saison 2 · Frühjahr 26', start: '2026-03-01', end: '2026-05-31' },
    { id: 's3', name: 'Saison 3 · Sommer 26',   start: '2026-06-01', end: '2026-08-31' }
  ];

  var GAMES = [
    { id: 'wizard',   title: 'Wizard',            genre: 'Karten',    dauerMin: 45,  minAffen: 3, maxAffen: 6, modul: 'wizard', range: [-40, 220] },
    { id: 'catan',    title: 'Catan',             genre: 'Strategie', dauerMin: 90,  minAffen: 3, maxAffen: 4, modul: 'catan',  range: [4, 12] },
    { id: 'codenames',title: 'Codenames',         genre: 'Party',     dauerMin: 20,  minAffen: 4, maxAffen: 8, range: [0, 9] },
    { id: 'skullking',title: 'Skull King',        genre: 'Karten',    dauerMin: 40,  minAffen: 2, maxAffen: 6, range: [-30, 190] },
    { id: 'justone',  title: 'Just One',          genre: 'Party',     dauerMin: 20,  minAffen: 3, maxAffen: 7, range: [4, 13] },
    { id: 'brass',    title: 'Brass: Birmingham', genre: 'Strategie', dauerMin: 120, minAffen: 2, maxAffen: 4, range: [90, 190] },
    { id: 'azul',     title: 'Azul',              genre: 'Strategie', dauerMin: 35,  minAffen: 2, maxAffen: 4, range: [30, 105] },
    { id: 'sechsnimmt', title: '6 nimmt!',        genre: 'Karten',    dauerMin: 25,  minAffen: 3, maxAffen: 6, lowerWins: true, range: [5, 62] }
  ];

  /* Stärkeprofil je Affe — sorgt für eine Tabelle mit Gefälle statt Rauschen. */
  var FORM = { maik: 0.62, mattes: 0.74, bene: 0.44, torben: 0.55, benni: 0.38, tobi: 0.30 };

  var TITEL = [
    'Dienstags-Debakel', 'Kellerabend', 'Nachsitzen', 'Der lange Dienstag',
    'Revanche', 'Kartenchaos', 'Spieleabend', 'Rückrunde', 'Freitagsschicht'
  ];

  function iso(y, m, d) {
    return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  /* Alle zwei Wochen ein Abend, Januar bis August 2026. */
  function dates() {
    var out = [];
    var d = new Date(Date.UTC(2026, 0, 6)); // erster Dienstag
    while (d.getTime() < Date.UTC(2026, 7, 5)) {
      out.push(iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()));
      d.setUTCDate(d.getUTCDate() + 14);
    }
    return out;
  }

  function scoreFor(game, playerId) {
    var lo = game.range[0], hi = game.range[1];
    var form = FORM[playerId] || 0.5;
    // Form zieht das Ergebnis nach oben, Zufall streut ordentlich dagegen.
    var t = Math.min(1, Math.max(0, form * 0.55 + rnd() * 0.65));
    var v = Math.round(lo + t * (hi - lo));
    return game.lowerWins ? Math.round(hi - (v - lo) * 0.9) : v;
  }

  function buildNights() {
    var nights = [];
    dates().forEach(function (date, i) {
      var active = PLAYERS.filter(function (p) {
        if (p.id === 'tobi') return date < '2026-05-01';  // Tobi steigt im Mai aus
        return true;
      });
      // Nicht immer sind alle da.
      var dabei = active.filter(function () { return rnd() > 0.16; });
      if (dabei.length < 3) dabei = active.slice(0, 4);

      var anzahl = int(1, 3);
      var used = {};
      var spiele = [];
      for (var g = 0; g < anzahl; g++) {
        var game = pickOne(GAMES);
        if (used[game.id]) continue;
        used[game.id] = true;
        var mitspieler = dabei.slice(0, Math.min(dabei.length, game.maxAffen));
        if (mitspieler.length < game.minAffen) continue;
        spiele.push({
          id: 'g_' + i + '_' + g,
          gameId: game.id,
          title: game.title,
          lowerWins: !!game.lowerWins,
          durationMin: game.dauerMin + int(-8, 20),
          results: mitspieler.map(function (p) {
            var score = scoreFor(game, p.id);
            var r = { playerId: p.id, score: score };
            // Zwei Drittel tippen vorher — mit dem üblichen Optimismus.
            if (rnd() > 0.34) r.tip = Math.max(game.range[0], Math.round(score + (rnd() - 0.35) * (game.range[1] - game.range[0]) * 0.28));
            return r;
          })
        });
      }
      if (!spiele.length) return;

      nights.push({
        id: 'n' + (i + 1),
        date: date,
        title: TITEL[i % TITEL.length],
        hostId: dabei[int(0, dabei.length - 1)].id,
        status: 'fertig',
        dabei: dabei.map(function (p) { return p.id; }),
        snacks: [],
        games: spiele
      });
    });
    return nights;
  }

  var nights = buildNights();

  /* Ein laufender Abend — dafür ist der „Abend läuft"-Screen da. */
  nights.push({
    id: 'n_live',
    date: '2026-08-11',
    title: 'Dienstags-Debakel',
    hostId: 'maik',
    status: 'laeuft',
    dabei: ['maik', 'mattes', 'bene', 'torben', 'benni'],
    runde: 4,
    runden: 7,
    startedAt: '19:48',
    snacks: [
      { was: 'Chips', wer: 'Mattes', ok: true },
      { was: 'Bier', wer: 'Bene', ok: true },
      { was: 'Pizza', wer: 'Maik', ok: true },
      { was: 'Nachtisch', wer: null, ok: false }
    ],
    games: [{
      id: 'g_live', gameId: 'wizard', title: 'Wizard', lowerWins: false,
      results: [
        { playerId: 'maik', score: 90 }, { playerId: 'mattes', score: 130 },
        { playerId: 'bene', score: 60 }, { playerId: 'torben', score: 85 },
        { playerId: 'benni', score: 45 }
      ]
    }]
  });

  /* Und einer, der erst noch stattfindet. */
  nights.push({
    id: 'n_next',
    date: '2026-08-18',
    title: 'Revanche',
    hostId: 'torben',
    status: 'geplant',
    dabei: ['maik', 'mattes', 'bene', 'torben', 'benni'],
    snacks: [
      { was: 'Chips', wer: 'Benni', ok: true },
      { was: 'Bier', wer: null, ok: false },
      { was: 'Pizza', wer: 'Torben', ok: true },
      { was: 'Nachtisch', wer: null, ok: false }
    ],
    games: []
  });

  return {
    meta: { version: 1, demo: true },
    players: PLAYERS,
    seasons: SEASONS,
    games: GAMES.map(function (g) {
      return {
        id: g.id, title: g.title, genre: g.genre, dauerMin: g.dauerMin,
        minAffen: g.minAffen, maxAffen: g.maxAffen, lowerWins: !!g.lowerWins, modul: g.modul || null
      };
    }),
    nights: nights,
    modules: {
      catan: { sessions: [{ id: 'c1', date: '2026-07-28', counts: { 6: 9, 7: 14, 8: 11, 5: 7, 9: 6, 4: 5, 10: 4, 3: 3, 11: 3, 2: 1, 12: 2 }, raeuber: { maik: 4, mattes: 6, bene: 2, torben: 2 } }] },
      wizard: { sessions: [] }
    },
    houseRules: [
      { nr: 1, text: 'Wer verliert, zahlt die Pizza.' },
      { nr: 4, text: 'Wer zu spät kommt, mischt.' },
      { nr: 7, text: 'Regeln werden vor dem Spiel geklärt. Nicht danach.' }
    ]
  };
});
