/* SpieleAffen — Regeltest.
 *
 *   node spieleaffen/test-engine.js
 *
 * Prüft die Punkteregeln, über die am Tisch gestritten wird: Platzierung
 * 4/3/2/1, geteilte Plätze, Tipp-Bonus, Abendsieger — und dass die Demo-Daten
 * sauber durch die Gesamtauswertung laufen.
 */
'use strict';

var SA = require('./js/engine.js');
var DEMO = require('./demo-data.js');

var fails = 0, checks = 0;
function eq(actual, expected, label) {
  checks++;
  var a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { fails++; console.log('  FAIL  ' + label + '\n        erwartet ' + e + ', bekommen ' + a); }
  else console.log('  ok    ' + label);
}
function section(name) { console.log('\n' + name); }

// ── Platzierungspunkte 4/3/2/1 ──────────────────────────────────────────────
section('Platzierung je Spiel: 4/3/2/1, ab dem fünften nichts');
var g1 = SA.evalGame({ results: [
  { playerId: 'a', score: 100 }, { playerId: 'b', score: 80 },
  { playerId: 'c', score: 60 },  { playerId: 'd', score: 40 },
  { playerId: 'e', score: 20 },  { playerId: 'f', score: 10 }
] });
eq(g1.a.placePts, 4, 'Erster bekommt 4');
eq(g1.b.placePts, 3, 'Zweiter bekommt 3');
eq(g1.c.placePts, 2, 'Dritter bekommt 2');
eq(g1.d.placePts, 1, 'Vierter bekommt 1');
eq(g1.e.placePts, 0, 'Fünfter geht leer aus');
eq(g1.f.placePts, 0, 'Und der Sechste erst recht');

// In der Fünferrunde geht die Staffel genau auf: der Letzte bekommt null.
var g1b = SA.evalGame({ results: [
  { playerId: 'a', score: 50 }, { playerId: 'b', score: 40 }, { playerId: 'c', score: 30 },
  { playerId: 'd', score: 20 }, { playerId: 'e', score: 10 }
] });
eq([g1b.a, g1b.b, g1b.c, g1b.d, g1b.e].map(function (x) { return x.placePts; }), [4, 3, 2, 1, 0],
  'Zu fünft: 4/3/2/1/0');

section('Gleichstand: die Punkte der belegten Plätze werden geteilt');
var g2 = SA.evalGame({ results: [
  { playerId: 'a', score: 100 }, { playerId: 'b', score: 100 },
  { playerId: 'c', score: 60 },  { playerId: 'd', score: 20 }
] });
eq([g2.a.place, g2.b.place, g2.c.place, g2.d.place], [1, 1, 3, 4], 'Plätze 1,1,3,4');
eq([g2.a.placePts, g2.b.placePts], [3.5, 3.5], 'Zwei Erste teilen (4+3)/2 = 3,5');
eq(g2.c.placePts, 2, 'Der Nächste steht auf Platz 3 und bekommt 2');
eq(g2.d.placePts, 1, 'Der Vierte bekommt 1');

var g2b = SA.evalGame({ results: [
  { playerId: 'a', score: 10 }, { playerId: 'b', score: 10 }, { playerId: 'c', score: 10 },
  { playerId: 'd', score: 5 }
] });
eq([g2b.a.placePts, g2b.b.placePts, g2b.c.placePts], [3, 3, 3], 'Drei Erste teilen (4+3+2)/3 = 3');
eq(g2b.d.placePts, 1, 'Der Vierte bleibt der Vierte');

var g2c = SA.evalGame({ results: [
  { playerId: 'a', score: 9 }, { playerId: 'b', score: 5 }, { playerId: 'c', score: 5 }
] });
eq([g2c.b.placePts, g2c.c.placePts], [2.5, 2.5], 'Zwei Zweite teilen (3+2)/2 = 2,5');

// Der Topf bleibt der Topf: geteilt oder nicht, es wird nichts erfunden.
var summe1 = ['a', 'b', 'c', 'd'].reduce(function (n, k) { return n + g2[k].placePts; }, 0);
eq(summe1, 4 + 3 + 2 + 1, 'Geteilte Plätze vergeben zusammen genauso viel wie ungeteilte');

section('lowerWins: weniger gewinnt');
var g3 = SA.evalGame({ lowerWins: true, results: [
  { playerId: 'a', score: 50 }, { playerId: 'b', score: 12 }, { playerId: 'c', score: 30 }
] });
eq([g3.b.place, g3.c.place, g3.a.place], [1, 2, 3], 'Niedrigste Punktzahl führt');

// ── Tipps: Statistik, keine Punkte ──────────────────────────────────────────
section('Tippen wird gezählt, aber nicht bezahlt');
var g4 = SA.evalGame({ results: [
  { playerId: 'a', score: 100, tip: 90 },   // 10 daneben
  { playerId: 'b', score: 80, tip: 82 },    // 2 daneben  → am nächsten dran
  { playerId: 'c', score: 60 }              // kein Tipp
] });
eq(g4.b.tipBest, true, 'Der Nächste am eigenen Tipp ist markiert');
eq(g4.a.tipBest, false, 'Der Weitere nicht');
eq(g4.c.tipBest, false, 'Wer nicht tippt, ist nie der Nächste');
eq(g4.c.tipDiff, null, 'Ohne Tipp keine Abweichung');
eq(g4.b.tipPts, undefined, 'Es gibt keine Tipp-Punkte mehr');
eq([g4.a.placePts, g4.b.placePts, g4.c.placePts], [4, 3, 2],
  'Der Tipp verschiebt keine Platzpunkte');

var g5 = SA.evalGame({ results: [
  { playerId: 'a', score: 100, tip: 95 }, { playerId: 'b', score: 50, tip: 45 }
] });
eq([g5.a.tipBest, g5.b.tipBest], [true, true], 'Gleiche Abweichung: beide gelten als am nächsten');

var g6 = SA.evalGame({ results: [{ playerId: 'a', score: 42, tip: 42 }] });
eq(g6.a.exact, true, 'Exakter Tipp gilt als getroffen');

// ── Abend ───────────────────────────────────────────────────────────────────
section('Abend: nur Platzpunkte — kein Antreten, kein Tipp');
var n1 = SA.evalNight({ games: [{
  title: 'Wizard',
  results: [
    { playerId: 'a', score: 100, tip: 98 },  // Platz 1, Tipp getroffen = 4
    { playerId: 'b', score: 80 },            // Platz 2                 = 3
    { playerId: 'c', score: 60 },            // Platz 3                 = 2
    { playerId: 'd', score: 40 },            // Platz 4                 = 1
    { playerId: 'e', score: 20 }             // Platz 5                 = 0
  ]
}] });
eq(n1.per.a.total, 4, 'a: nur der Platz — der gute Tipp bringt nichts');
eq(n1.per.b.total, 3, 'b: nur der Platz');
eq(n1.per.e.total, 0, 'Der Letzte bekommt null — genau darum gibt es keinen Antreten-Punkt');
eq(n1.per.a.partPts, undefined, 'Antreten-Punkte gibt es nicht mehr');
eq(n1.winners, ['a'], 'Abendsieger ist, wer die meisten Punkte hat');
eq(n1.losers, ['e'], 'Letzter des Abends ist eindeutig der Schlechteste');

section('Mehrere Spiele addieren sich');
var n2 = SA.evalNight({ games: [
  { title: 'A', results: [{ playerId: 'a', score: 10 }, { playerId: 'b', score: 5 }] },
  { title: 'B', results: [{ playerId: 'a', score: 10 }, { playerId: 'b', score: 5 }] }
] });
eq(n2.per.a.total, 8, 'a: 4 + 4 = 8');
eq(n2.per.b.total, 6, 'b: 3 + 3 = 6');

section('Halbe Punkte überleben die Addition');
var n2b = SA.evalNight({ games: [
  { title: 'A', results: [{ playerId: 'a', score: 10 }, { playerId: 'b', score: 10 }] },
  { title: 'B', results: [{ playerId: 'a', score: 10 }, { playerId: 'b', score: 5 }] }
] });
eq(n2b.per.a.total, 7.5, 'a: 3,5 aus dem geteilten Sieg plus 4');
eq(n2b.per.b.total, 6.5, 'b: 3,5 plus 3');

section('Punktgleichheit: geteilter Abendsieg, niemand ist Letzter');
var n3 = SA.evalNight({ games: [{ title: 'A', results: [
  { playerId: 'a', score: 10 }, { playerId: 'b', score: 10 }
] }] });
eq(n3.winners.sort(), ['a', 'b'], 'Beide sind Abendsieger');
eq(n3.losers, [], 'Bei voller Gleichheit ist niemand Letzter');

// ── Gesamtauswertung über die Demo-Daten ────────────────────────────────────
section('Demo-Daten laufen durch die Gesamtauswertung');
var c = SA.compute(DEMO);
eq(c.playedNights.length > 10, true, 'Mehr als zehn gespielte Abende (' + c.playedNights.length + ')');
eq(c.liveNight != null, true, 'Ein laufender Abend ist erkannt');
eq(c.nextNight != null, true, 'Ein geplanter Abend ist erkannt');
eq(c.seasons.length, 3, 'Drei Saisons');

var tabelle = c.standings('all', { youId: 'maik' });
eq(tabelle.length, 5, 'Fünf aktive Affen in der ewigen Tabelle');
eq(tabelle[0].place, 1, 'Die Tabelle ist nach Platz sortiert');
eq(tabelle.every(function (r) { return !r.archiv; }), true, 'Archivierte Affen tauchen nicht auf');
eq(tabelle.some(function (r) { return r.you; }), true, '„Du" ist markiert');
eq(tabelle.every(function (r) { return Math.round(r.points * 100) === r.points * 100; }), true,
  'Punkte tragen höchstens zwei Nachkommastellen', JSON.stringify(tabelle.map(function (r) { return r.points; })));

var summe = tabelle.reduce(function (s, r) { return s + r.nights; }, 0);
eq(summe > 0, true, 'Abende sind gezählt (' + summe + ')');
eq(c.standings('all', { includeArchived: true }).length, 6, 'Mit Archiv sind es sechs');

section('Gesamttabelle: nur Siegpunkte');
// Zwei Abende, einer davon mit lauter guten Tipps. Die Tabelle darf davon
// nichts mitbekommen — sonst hinge sie an einem einzigen Spiel.
var nurPlaetze = SA.compute({
  players: [{ id: 'a', name: 'A', seat: 1 }, { id: 'b', name: 'B', seat: 2 }],
  seasons: [], games: [], modules: {}, houseRules: [],
  nights: [{
    id: 'n1', date: '2026-01-06', title: 'Test', status: 'fertig', dabei: ['a', 'b'],
    games: [{ id: 'g1', title: 'Wizard', results: [
      { playerId: 'a', score: 10, tip: 10 },   // Platz 1, Tipp exakt
      { playerId: 'b', score: 5 }              // Platz 2, kein Tipp
    ] }]
  }]
});
var zeilen = nurPlaetze.standings('all');
var aZeile = zeilen.filter(function (r) { return r.id === 'a'; })[0];
var bZeile = zeilen.filter(function (r) { return r.id === 'b'; })[0];
eq(aZeile.points, 4, 'Platz 1 bringt 4 — der exakte Tipp bringt nichts dazu');
eq(bZeile.points, 3, 'Platz 2 bringt 3');
eq(aZeile.tipExacts, 1, 'Getroffen wurde er trotzdem gezählt');
eq(aZeile.tipBonuses, 1, 'Und als Nächster am eigenen Tipp auch');

section('Sitzfarben: jede höchstens einmal vergeben');
var seats = c.players.filter(function (p) { return !p.archived; }).map(function (p) { return p.seat; });
eq(seats.length, new Set(seats).size, 'Keine Sitzfarbe doppelt belegt');
eq(SA.freeSeats(c.players), [6, 7, 8, 9], 'Frei ist alles ab Seat 6 — Tobi ist archiviert');

var vergabe = SA.seatVergabe(c.players);
eq(Object.keys(vergabe).length, SA.SEATS.length, 'Die Vergabe kennt jede Sitzfarbe');
eq(vergabe[6], null, 'Seat 6 ist unbesetzt — der archivierte Tobi zählt nicht');
eq([1, 2, 3, 4, 5].every(function (s) { return vergabe[s] && vergabe[s].seat === s; }), true,
  'Jede belegte Farbe zeigt auf den Affen, der darauf sitzt');

// Farben haben Namen, damit „ich nehm Minze" am Tisch funktioniert.
eq(SA.SEATS.every(function (s) { return /^[A-Za-zÄÖÜäöü]+$/.test(SA.seatName(s)); }), true,
  'Jede Sitzfarbe trägt einen Namen', JSON.stringify(SA.SEATS.map(SA.seatName)));
eq(new Set(SA.SEATS.map(SA.seatName)).size, SA.SEATS.length, 'Kein Name doppelt');
eq(SA.seatName(3), 'Punsch', 'Seat 3 heißt nach dem Token, das dahintersteckt');

// Und jede Farbe braucht ihren Token, sonst bleibt der Avatar durchsichtig.
var tokens = require('fs').readFileSync(__dirname + '/css/tokens.css', 'utf8');
eq(SA.SEATS.filter(function (s) { return tokens.indexOf('--seat-' + s + ':') < 0; }), [],
  'Zu jeder Sitzfarbe steht ein --seat-N in den Tokens');
var zwei = SA.seatVergabe([
  { id: 'a', name: 'Anna', seat: 2 },
  { id: 'b', name: 'Ben', seat: 2 }
]);
eq(zwei[2].id, 'a', 'Bei doppelter Belegung gewinnt der erste — die Vergabe rät nicht');

section('Pokale');
eq(c.achievements.length, 14, 'Vierzehn Pokale im Katalog');
eq(c.achievements.every(function (a) { return !/[\u{1F300}-\u{1FAFF}]/u.test(a.name + a.desc); }), true,
  'Kein Emoji in den Pokalen — das Design-System verbietet es');
var vergeben = Object.keys(c.achState).reduce(function (s, pid) { return s + Object.keys(c.achState[pid]).length; }, 0);
eq(vergeben > 0, true, 'Pokale wurden vergeben (' + vergeben + ')');

section('Rekorde');
eq(c.records.bestNightPoints != null, true, 'Bester Abend ist erfasst');
eq(c.records.bestStreak != null, true, 'Längste Serie ist erfasst');
eq(Object.keys(c.records.bestScoreByTitle).length > 0, true, 'Bestwerte je Spiel sind erfasst');

section('Spiele-Regal');
eq(c.shelf.length, 8, 'Acht Spiele im Regal');
eq(c.shelf[0].plays >= c.shelf[c.shelf.length - 1].plays, true, 'Nach Häufigkeit sortiert');
eq(c.shelf.some(function (g) { return g.modul === 'catan'; }), true, 'Catan hat ein Modul');
eq(c.shelf.some(function (g) { return g.modul === 'wizard'; }), true, 'Wizard hat ein Modul');

section('Wizard: die Rundenzahl hängt an der Anzahl der Affen');
// 60 Karten, restlos verteilt — mehr Mitspieler heißt weniger Runden.
eq(SA.wizardRunden(3), 20, 'Drei Affen spielen 20 Runden');
eq(SA.wizardRunden(4), 15, 'Vier Affen spielen 15 Runden');
eq(SA.wizardRunden(5), 12, 'Fünf Affen spielen 12 Runden');
eq(SA.wizardRunden(6), 10, 'Sechs Affen spielen 10 Runden');
eq(SA.wizardRunden(1), 0, 'Alleine geht es nicht');
eq(SA.wizardRunden(0), 0, 'Ohne Affen erst recht nicht');
eq(SA.wizardRunden(7) * 7 <= 60, true, 'Die Runden passen immer ins Blatt');

section('Wizard: Wertung');
eq(SA.wizardPunkte(0, 0), 20, 'Null angesagt, null geholt: 20');
eq(SA.wizardPunkte(1, 1), 30, 'Einen angesagt und geholt: 20 + 10');
eq(SA.wizardPunkte(3, 3), 50, 'Drei getroffen: 20 + 30');
eq(SA.wizardPunkte(2, 0), -20, 'Zwei angesagt, keinen geholt: −20');
eq(SA.wizardPunkte(0, 2), -20, 'Zu viele geholt kostet genauso viel');
eq(SA.wizardPunkte(5, 4), -10, 'Einer daneben: −10');

section('Startaufstellung');
var start = SA.modulSpiele();
eq(start.length, 2, 'Nur die zwei Spiele mit eigenem Werkzeug');
eq(start.map(function (g) { return g.modul; }).sort(), ['catan', 'wizard'], 'Catan und Wizard');
eq(start.every(function (g) { return g.title && g.genre && g.minAffen && g.maxAffen; }), true,
  'Jedes trägt alles, was das Regal anzeigt');

var saison = SA.startSaison('2026-08-11');
eq(saison.start <= '2026-08-11' && saison.end >= '2026-08-11', true,
  'Die Startsaison umfasst den heutigen Tag', JSON.stringify(saison));
// Quartale, nicht Monate: der Februar gehört zum ersten, das im März endet.
eq(SA.startSaison('2026-02-15').start, '2026-01-01', 'Februar beginnt im ersten Quartal');
eq(SA.startSaison('2026-02-15').end, '2026-03-31', 'und endet mit dem März');
eq(SA.startSaison('2026-12-31').end, '2026-12-31', 'Silvester ist noch drin');
eq(['2026-01-01','2026-04-01','2026-07-01','2026-11-30'].map(function (d) {
  var s = SA.startSaison(d); return s.start <= d && s.end >= d;
}), [true, true, true, true], 'Jedes Quartal enthält seinen eigenen Tag');
eq(SA.compute({ players: [], seasons: [saison], games: SA.modulSpiele(), nights: [] }).shelf.length, 2,
  'Die Startaufstellung läuft durch die Auswertung');

section('Determinismus: zweimal rechnen ergibt dasselbe');
var wieder = SA.compute(require('./demo-data.js'));
eq(JSON.stringify(wieder.standings('all')), JSON.stringify(c.standings('all')), 'Gleiche Tabelle bei erneuter Berechnung');

console.log('\n' + (fails ? fails + ' von ' + checks + ' Prüfungen fehlgeschlagen.' : 'Alle ' + checks + ' Prüfungen bestanden.'));
process.exit(fails ? 1 : 0);
