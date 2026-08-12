/* SpieleAffen — das Tor.
 *
 * Der Code schaltet nicht einzelne Knöpfe frei, sondern die ganze Oberfläche.
 * Wer nicht angemeldet ist, sieht die App verschwommen hinter der Karte —
 * genug, um zu erkennen, dass es sie gibt, zu wenig, um damit zu arbeiten.
 * Ein Geheimnis ist das nicht: GET /api/data ist öffentlich, die Unschärfe ist
 * eine Tür, kein Tresor. Sie hält Zufallsgäste davon ab, Punkte zu verstellen.
 *
 * Zwei Wege hinein:
 *   – vier Ziffern, der Alltag. Jeder Affe hat seine eigenen.
 *   – der lange Admin-Schlüssel aus den Worker-Secrets. Nötig, solange es
 *     keinen Admin gibt (erste Einrichtung) und wenn sich die Runde ausgesperrt
 *     hat. Gibt es keinen Admin, steht dieser Weg von selbst vorn.
 *
 * Der Zustand liegt auf Modulebene: jede Toast-Meldung zeichnet die Schale neu.
 * Läge er in der Funktion, fiele man nach einem Fehlversuch auf die vier Ziffern
 * zurück — mit dem langen Schlüssel in der Zwischenablage und keinem Feld dafür.
 */
(function () {
  'use strict';
  var h = window.h, U = window.SA_UI, S = window.SA_STORE;

  var langerWeg = false;
  var versuche = 0;
  var falschStand = false;

  /* Gibt es überhaupt jemanden, der Codes vergeben könnte? Steht im öffentlichen
     Dokument, also weiß die App das auch, bevor sich jemand angemeldet hat. */
  function keinAdminDa(c) {
    return !(c.players || []).some(function (p) { return p.admin && !p.archived; });
  }

  function karte(state, c) {
    var wirt = h('div');
    var ohneAdmin = keinAdminDa(c);
    // Ohne Admin führt kein Weg über vier Ziffern hinein — dann gleich der lange.
    if (ohneAdmin && window.SA_API.hasBackend()) langerWeg = true;

    function zeichne(falsch) {
      falschStand = !!falsch;
      window.SA_DOM.mount(wirt, langerWeg ? schluessel(falschStand) : ziffern(falschStand));
    }

    function ziffern(falsch) {
      var pin = U.PinInput({
        length: 4, invalid: falsch, autoFocus: true,
        hint: falsch ? 'Falscher Code. Der Block merkt sich das.' : 'Deine vier Ziffern. Nicht die von jemand anderem.',
        onComplete: pruefen
      });
      return U.Card({
        tone: falsch ? 'live' : 'neon',
        style: { width: 'min(420px, 100%)', animation: falsch ? 'sa-boing var(--dur-base) var(--ease-boing)' : null },
        eyebrow: 'Nur für Affen mit Schlüssel',
        title: 'Affenschlüssel',
        children: [
          h('span.sa-body', 'Vier Ziffern, dann gehört dir der Block. Ohne sie bleibt alles unscharf.'),
          pin,
          h('div.sa-inline', null,
            U.Button({
              children: 'Rein', iconLeft: 'lock_open',
              onClick: function () {
                var wert = Array.prototype.map.call(pin.querySelectorAll('input'), function (i) { return i.value; }).join('');
                pruefen(wert);
              }
            }),
            U.Button({ children: 'Löschen', variant: 'ghost', onClick: function () { pin.clear(); } })),
          versuche >= 2 ? h('span.sa-meta', { style: { color: 'var(--punsch-400)' } }, demoTipp(state)) : null,
          window.SA_API.hasBackend() ? U.Button({
            children: 'Mit Admin-Schlüssel', variant: 'ghost', size: 'sm', iconLeft: 'key',
            onClick: function () { langerWeg = true; zeichne(false); }
          }) : null
        ]
      });
    }

    function schluessel(falsch) {
      var feld = U.Input({
        label: 'Admin-Schlüssel', type: 'password', icon: 'key',
        placeholder: 'der lange aus wrangler secret put',
        error: falsch ? 'Stimmt nicht. Groß- und Kleinschreibung zählt.' : null,
        hint: falsch ? null : 'Steht in den Worker-Secrets. Siehe DEPLOY.md.',
        onKeyDown: function (e) { if (e.key === 'Enter') pruefen(feld.input.value.trim()); }
      });
      setTimeout(function () { feld.input.focus(); }, 30);
      return U.Card({
        tone: falsch ? 'live' : 'neon',
        style: { width: 'min(420px, 100%)', animation: falsch ? 'sa-boing var(--dur-base) var(--ease-boing)' : null },
        eyebrow: ohneAdmin ? 'Noch kein Admin da' : 'Der lange Weg',
        title: 'Admin-Schlüssel',
        children: [
          h('span.sa-body', ohneAdmin
            ? 'Es gibt noch keinen Affen mit Adminrechten. Also der Schlüssel vom Deploy — danach legst du Affen an und gibst ihnen ihre vier Ziffern.'
            : 'Für den Fall, dass sich die Runde ausgesperrt hat.'),
          feld,
          h('div.sa-inline', null,
            U.Button({ children: 'Rein', iconLeft: 'lock_open', onClick: function () { pruefen(feld.input.value.trim()); } }),
            ohneAdmin ? null : U.Button({
              children: 'Zurück zu vier Ziffern', variant: 'ghost',
              onClick: function () { langerWeg = false; zeichne(false); }
            }))
        ]
      });
    }

    function pruefen(wert) {
      if (!wert || wert.length < 4) return;
      S.login(wert).then(function (spieler) {
        langerWeg = false;
        versuche = 0;
        falschStand = false;
        S.toast('Drin', 'Hallo ' + spieler.name + '. Bitte keine Dummheiten.', 'slime');
      }).catch(function (err) {
        versuche += 1;
        zeichne(true);
        S.toast('Falsch', err.status === 429
          ? 'Zu viele Versuche. Kurz durchatmen.'
          : versuche >= 2 ? 'Zweiter Versuch, gleiche Frechheit.' : 'Netter Versuch, Affe.', 'punsch');
      });
    }

    // Nicht zeichne(false): ein Neuaufbau der Schale darf die Fehlermeldung
    // nicht wegwischen.
    zeichne(falschStand);
    return wirt;
  }

  function demoTipp(state) {
    if (state.source !== 'demo') return 'Code vergessen? Ein Admin setzt ihn neu.';
    var codes = S.demoCodes();
    var erster = Object.keys(codes)[0];
    return 'Demo-Modus. Tipp für Verzweifelte: ' + codes[erster] + ' ist ' + erster + '. Aber das bleibt unter uns.';
  }

  /* Beim Abmelden soll wieder das Vier-Ziffern-Feld vorn stehen. */
  function zuruecksetzen() {
    langerWeg = false;
    versuche = 0;
    falschStand = false;
  }

  window.SA_GATE = { karte: karte, keinAdminDa: keinAdminDa, zuruecksetzen: zuruecksetzen };
})();
