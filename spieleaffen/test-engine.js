/* SpieleAffen — Regeltest.
 *
 *   node spieleaffen/test-engine.js
 *
 * Prüft die Punkteregeln, über die am Tisch gestritten wird: Platzierung,
 * geteilte Plätze, Antreten, Tipp-Bonus, Strafe, Abendsieger — und dass die
 * Demo-Daten sauber durch die Gesamtauswertung laufen.
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

// ── Platzierungspunkte 5/3/1 ────────────────────────────────────────────────
section('Platzierung je Spiel: 1./2./3. = 5/3/1');
var g1 = SA.evalGame({ results: [
  { playerId: 'a', score: 100 }, { playerId: 'b', score: 80 },
  { playerId: 'c', score: 60 },  { playerId: 'd', score: 40 }
] });
eq(g1.a.placePts, 5, 'Erster bekommt 5');
eq(g1.b.placePts, 3, 'Zweiter bekommt 3');
eq(g1.c.placePts, 1, 'Dritter bekommt 1');
eq(g1.d.placePts, 0, 'Vierter bekommt 0');

section('Gleichstand teilt den Platz („1224")');
var g2 = SA.evalGame({ results: [
  { playerId: 'a', score: 100 }, { playerId: 'b', score: 100 },
  { playerId: 'c', score: 60 },  { playerId: 'd', score: 20 }
] });
eq([g2.a.place, g2.b.place, g2.c.place, g2.d.place], [1, 1, 3, 4], 'Plätze 1,1,3,4');
eq([g2.a.placePts, g2.b.placePts, g2.c.placePts], [5, 5, 1], 'Beide Erste bekommen 5, der Dritte 1');

section('lowerWins: weniger gewinnt');
var g3 = SA.evalGame({ lowerWins: true, results: [
  { playerId: 'a', score: 50 }, { playerId: 'b', score: 12 }, { playerId: 'c', score: 30 }
] });
eq([g3.b.place, g3.c.place, g3.a.place], [1, 2, 3], 'Niedrigste Punktzahl führt');

// ── Tipp-Bonus ──────────────────────────────────────────────────────────────
section('Tipp-Bonus: +3 für die kleinste Abweichung');
var g4 = SA.evalGame({ results: [
  { playerId: 'a', score: 100, tip: 90 },   // 10 daneben
  { playerId: 'b', score: 80, tip: 82 },    // 2 daneben  → Bonus
  { playerId: 'c', score: 60 }              // kein Tipp
] });
eq(g4.b.tipPts, 3, 'Bester Tipper bekommt 3');
eq(g4.a.tipPts, 0, 'Schlechterer Tipper bekommt nichts');
eq(g4.c.tipPts, 0, 'Wer nicht tippt, bekommt nichts');
eq(g4.c.tipDiff, null, 'Ohne Tipp keine Abweichung');

var g5 = SA.evalGame({ results: [
  { playerId: 'a', score: 100, tip: 95 }, { playerId: 'b', score: 50, tip: 45 }
] });
eq([g5.a.tipPts, g5.b.tipPts], [3, 3], 'Gleiche Abweichung: alle Nächsten bekommen den Bonus');

var g6 = SA.evalGame({ results: [{ playerId: 'a', score: 42, tip: 42 }] });
eq([g6.a.exact, g6.a.tipPts], [true, 3], 'Exakter Tipp gilt als getroffen');

// ── Abend: Antreten, Strafe, Abendsieger ────────────────────────────────────
section('Abend: Antreten +1, Strafe −20, Abendsieger');
var n1 = SA.evalNight({ games: [{
  title: 'Wizard',
  results: [
    { playerId: 'a', score: 100, tip: 98 },  // 5 Platz + 3 Tipp + 1 Antreten = 9
    { playerId: 'b', score: 80 },            // 3 Platz + 1 Antreten          = 4
    { playerId: 'c', score: 60, strafe: true } // 1 Platz + 1 Antreten − 20   = −18
  ]
}] });
eq(n1.per.a.total, 9, 'a: 5 + 3 + 1 = 9');
eq(n1.per.b.total, 4, 'b: 3 + 1 = 4');
eq(n1.per.c.total, -18, 'c: 1 + 1 − 20 = −18');
eq(n1.per.a.partPts, 1, 'Antreten zählt einmal pro Abend, nicht pro Spiel');
eq(n1.winners, ['a'], 'Abendsieger ist, wer die meisten Punkte hat');
eq(n1.losers, ['c'], 'Letzter des Abends ist eindeutig der Schlechteste');

section('Antreten zählt einmal, auch bei mehreren Spielen');
var n2 = SA.evalNight({ games: [
  { title: 'A', results: [{ playerId: 'a', score: 10 }, { playerId: 'b', score: 5 }] },
  { title: 'B', results: [{ playerId: 'a', score: 10 }, { playerId: 'b', score: 5 }] }
] });
eq(n2.per.a.partPts, 1, 'Ein Antreten-Punkt trotz zwei Spielen');
eq(n2.per.a.total, 11, 'a: 5 + 5 + 1 = 11');

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
eq(tabelle.every(function (r) { return r.points === Math.round(r.points); }), true, 'Punkte sind ganze Zahlen');

var summe = tabelle.reduce(function (s, r) { return s + r.nights; }, 0);
eq(summe > 0, true, 'Abende sind gezählt (' + summe + ')');
eq(c.standings('all', { includeArchived: true }).length, 6, 'Mit Archiv sind es sechs');

section('Sitzfarben: sechs Stück, jede höchstens einmal vergeben');
var seats = c.players.filter(function (p) { return !p.archived; }).map(function (p) { return p.seat; });
eq(seats.length, new Set(seats).size, 'Keine Sitzfarbe doppelt belegt');
eq(SA.freeSeats(c.players), [6], 'Seat 6 ist frei, weil Tobi archiviert ist');

section('Pokale');
eq(c.achievements.length, 15, 'Fünfzehn Pokale im Katalog');
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

section('Determinismus: zweimal rechnen ergibt dasselbe');
var wieder = SA.compute(require('./demo-data.js'));
eq(JSON.stringify(wieder.standings('all')), JSON.stringify(c.standings('all')), 'Gleiche Tabelle bei erneuter Berechnung');

console.log('\n' + (fails ? fails + ' von ' + checks + ' Prüfungen fehlgeschlagen.' : 'Alle ' + checks + ' Prüfungen bestanden.'));
process.exit(fails ? 1 : 0);
