/* SpieleAffen — teases.js
 * Portiert aus ui_kits/dashboard/teases.jsx.
 *
 * Kleine, freche Sprüche — alle deterministisch aus den Zahlen gewählt, damit
 * sie beim Re-render stehen bleiben. Ein Spruch, der bei jedem Rendern wechselt,
 * liest sich als Rauschen, nicht als Frechheit.
 *
 * Regeln aus dem Design-System: höchstens ein Tease pro Zahl, nie zwei
 * nebeneinander, unter acht Wörtern, immer über die Spielleistung — nie über
 * die Person, den Körper oder Geld.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SA_TEASE = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function pick(list, key) {
    var hash = 0;
    var s = String(key);
    for (var i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) % 100000;
    return list[hash % list.length];
  }

  var BURN_SIEGLOS = [
    'Null Siege. Beeindruckend konstant.',
    'Noch nie gewonnen. Aber immer dabei.',
    'Teilnahme ist auch ein Ergebnis. Angeblich.'
  ];
  var BURN_LETZTER = [
    'Zahlt die Pizza. Hausregel #1.',
    'Letzter Platz, erste Wahl beim Abräumen.',
    'Von unten sieht die Tabelle auch schön aus.'
  ];
  var BURN_RUTSCH = [
    'Rutscht. Langsam, aber sicher.',
    'Zwei Abende, zwei Rückschritte.',
    'Formkurve zeigt tapfer nach unten.'
  ];
  var BURN_SELTEN = [
    'Selten da. Sehr praktisch.',
    'Kommt nur, wenn’s einfach ist.',
    'Anwesenheit: optional. Ausreden: reichlich.'
  ];
  var BRAG_FUEHRT = [
    'Führt. Wieder. Wie langweilig.',
    'Ganz oben. Und weiß es.',
    'Führt so souverän, dass es weh tut.'
  ];
  var BRAG_SERIE = [
    'Ungeschlagen. Widerwillige Anerkennung.',
    'Serie läuft. Bitte kurz applaudieren.',
    'Gewinnt gerade schneller als wir mischen.'
  ];
  var BRAG_QUOTE = [
    'Gewinnt zu oft, um nett zu sein.',
    'Quote wie ein Profi, Sprüche wie ein Kind.',
    'Statistisch unangenehm gut.'
  ];
  var NEUTRAL = [
    'Solide unauffällig. Auch eine Strategie.',
    'Mittelfeld. Sicherer Hafen.',
    'Unspektakulär zuverlässig.'
  ];
  var LEER = [
    'Noch nichts gespielt. Noch nichts verloren.',
    'Blanko. Genieß es, solange es hält.'
  ];

  /* { text, tone } für einen Affen an Position `platz` (1-basiert). */
  function teaseSpieler(a, platz, anzahl) {
    if (!a.nights) return { text: pick(LEER, a.id), tone: 'neutral' };
    var quote = a.nights ? Math.round((a.wins / a.nights) * 100) : 0;
    if (a.streak >= 4) return { text: pick(BRAG_SERIE, a.id + a.streak), tone: 'brag' };
    if (platz === 1) return { text: pick(BRAG_FUEHRT, a.id), tone: 'brag' };
    if (platz === anzahl) return { text: pick(BURN_LETZTER, a.id), tone: 'burn' };
    if (a.wins === 0) return { text: pick(BURN_SIEGLOS, a.id), tone: 'burn' };
    if (quote >= 40) return { text: pick(BRAG_QUOTE, a.id + quote), tone: 'brag' };
    if (a.delta < 0) return { text: pick(BURN_RUTSCH, a.id + a.delta), tone: 'burn' };
    if (a.nights <= 8) return { text: pick(BURN_SELTEN, a.id + a.nights), tone: 'burn' };
    return { text: pick(NEUTRAL, a.id), tone: 'neutral' };
  }

  /* Kommentar zu einem Spiel im Regal. */
  function teaseSpiel(s) {
    if (s.plays >= 12) return { text: 'Läuft immer. Zu Recht.', tone: 'brag' };
    if (s.plays <= 2) return { text: 'Steht schön da. Mehr nicht.', tone: 'burn' };
    if (s.dauerMin && s.dauerMin >= 90) return { text: 'Dauert länger als die Diskussion danach.', tone: 'neutral' };
    return { text: 'Solides Mittelmaß im Regal.', tone: 'neutral' };
  }

  /* Kommentar zum Gesamtbild der Rangliste. */
  function teaseRang(list) {
    if (!list || list.length < 2) return { text: 'Eine Person, eine Meinung. Auch eine Tabelle.', tone: 'neutral' };
    var abstand = list[0].points - list[1].points;
    if (abstand > 40) return { text: list[0].name + ' führt mit ' + abstand + ' Punkten. Das ist Hohn.', tone: 'brag' };
    if (abstand <= 5) return { text: 'Fünf Punkte Unterschied. Endlich mal spannend.', tone: 'neutral' };
    return { text: list[list.length - 1].name + ' hält den letzten Platz warm.', tone: 'burn' };
  }

  /* Kommentar zum aktuellen Punktestand einer laufenden Runde. */
  function teaseRunde(fuehrt, letzter) {
    if (!fuehrt || !letzter || fuehrt === letzter) return { text: 'Noch nichts entschieden. Noch.', tone: 'neutral' };
    return { text: fuehrt.name + ' vorn, ' + letzter.name + ' hinten. Wie immer.', tone: 'burn' };
  }

  /* Urteil über eine Würfelverteilung (Catan-Modul). */
  function teaseWuerfel(total, maxAbweichung, siebenQuote) {
    if (total < 12) return { text: 'Zu wenig gewürfelt für ein Urteil.', tone: 'neutral' };
    if (siebenQuote >= 0.25) return { text: 'Der Räuber wohnt hier jetzt.', tone: 'burn' };
    if (maxAbweichung >= 0.5) return { text: 'Diese Würfel kennen keine Statistik.', tone: 'burn' };
    if (maxAbweichung <= 0.18) return { text: 'Lehrbuchverteilung. Wie langweilig.', tone: 'brag' };
    return { text: 'Leicht schief. Reicht als Ausrede nicht.', tone: 'neutral' };
  }

  /* Urteil über die Wahrheitsquote (Wizard-Modul). */
  function teaseWahrheit(name, quote) {
    if (quote == null) return { text: 'Noch nichts gesagt, noch nichts gelogen.', tone: 'neutral' };
    if (quote >= 0.7) return { text: name + ' sagt die Wahrheit. Verdächtig.', tone: 'brag' };
    if (quote <= 0.3) return { text: name + ' schätzt wie andere raten.', tone: 'burn' };
    return { text: 'Alle liegen daneben. Immerhin fair.', tone: 'neutral' };
  }

  return {
    pick: pick,
    teaseSpieler: teaseSpieler,
    teaseSpiel: teaseSpiel,
    teaseRang: teaseRang,
    teaseRunde: teaseRunde,
    teaseWuerfel: teaseWuerfel,
    teaseWahrheit: teaseWahrheit
  };
});
