/* SpieleAffen — dialogs.js
 * Die drei Dialoge aus dem UI-Kit: Abend planen, Ergebnis eintragen,
 * Affe hinzufügen. Alle drei schreiben ins Dokument und hinterlassen eine
 * Zeile im Änderungs-Log.
 *
 * Formularzustand lebt im Dialog selbst — deshalb löst Tippen hier kein
 * Neuzeichnen der Schale aus und der Fokus bleibt, wo er hingehört.
 */
(function () {
  'use strict';
  var h = window.h, U = window.SA_UI, SA = window.SA, S = window.SA_STORE, SH = window.SA_SHELL;

  function naechsterDienstag() {
    var d = new Date();
    d.setDate(d.getDate() + ((2 - d.getDay() + 7) % 7 || 7));
    return d.toISOString().slice(0, 10);
  }

  // ── Abend planen ─────────────────────────────────────────────────────────
  function abendPlanen() {
    var c = S.computed();
    var affen = c.standings('all', { includeEmpty: true });
    if (!affen.length) {
      S.toast('Keine Affen', 'Erst Leute anlegen, dann Abende planen.', 'punsch');
      return;
    }
    var dabei = affen.map(function (a) { return a.id; });
    var titelFeld = U.Input({ label: 'Wie heißt der Abend?', placeholder: 'z. B. Dienstags-Debakel' });
    var datumFeld = U.Input({ label: 'Wann?', type: 'date', value: naechsterDienstag(), icon: 'calendar-days' });
    var zeitFeld = U.Input({ label: 'Uhrzeit', value: '20:00', icon: 'clock' });
    var spielFeld = U.Select({
      label: 'Spiel', options: [{ value: '', label: 'Noch offen' }].concat(c.shelf.map(function (g) {
        return { value: g.id, label: g.title };
      }))
    });

    SH.overlay(function (close) {
      var tagRow = h('div.sa-inline');
      function zeichneTags() {
        window.SA_DOM.mount(tagRow, affen.map(function (a) {
          return U.Tag({
            children: a.name, color: U.seatVar(a.seat), size: 'sm',
            selected: dabei.indexOf(a.id) >= 0,
            onClick: function () {
              var i = dabei.indexOf(a.id);
              if (i >= 0) dabei.splice(i, 1); else dabei.push(a.id);
              zeichneTags();
            }
          });
        }));
      }
      zeichneTags();

      return U.Dialog({
        tone: 'neon', width: 520, eyebrow: 'Neuer Abend', title: 'Wer, wann, was?', onClose: close,
        children: [
          titelFeld,
          h('div.sa-cols.sa-cols--half', null, datumFeld, zeitFeld),
          spielFeld,
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' } },
            h('span.sa-label', 'Wer ist dabei?'), tagRow),
          U.Checkbox({ label: 'Erinnerung am Vorabend schicken', hint: 'An alle, auch an die Vergesslichen.', checked: true })
        ],
        footer: [
          U.Button({ children: 'Abbrechen', variant: 'ghost', onClick: close }),
          U.Button({
            children: 'Eintragen', iconLeft: 'check',
            onClick: function () {
              var titel = titelFeld.input.value.trim() || 'Spieleabend';
              var datum = datumFeld.input.value || naechsterDienstag();
              var spielId = spielFeld.select.value;
              var spiel = c.shelf.filter(function (g) { return g.id === spielId; })[0];
              if (dabei.length < 2) { S.toast('Zu wenig', 'Alleine spielt sich das schlecht.', 'punsch'); return; }
              S.update(function (doc) {
                doc.nights = doc.nights || [];
                doc.nights.push({
                  id: SA.uid('n'), date: datum, title: titel, hostId: dabei[0],
                  status: 'geplant', zeit: zeitFeld.input.value || '20:00',
                  dabei: dabei.slice(), snacks: standardSnacks(), games: []
                });
              }, {
                summary: 'Abend „' + titel + '" am ' + SA.fmtDate(datum) + ' geplant',
                entries: [{ icon: 'calendar-days', tone: 'slime', text: 'Abend „' + titel + '" geplant.', to: SA.fmtDate(datum) }]
              }).then(function () {
                close();
                S.toast('Abend steht', titel + ' ist eingetragen. Ausreden bis Dienstag.', 'slime');
              }).catch(function () { /* Meldung kam schon vom Store */ });
            }
          })
        ]
      });
    });
  }

  function standardSnacks() {
    return [
      { was: 'Chips', wer: null, ok: false },
      { was: 'Bier', wer: null, ok: false },
      { was: 'Pizza', wer: null, ok: false },
      { was: 'Nachtisch', wer: null, ok: false }
    ];
  }

  // ── Ergebnis eintragen ───────────────────────────────────────────────────
  /* Ein Spiel, ein Datum, je Affe Punkte + Tipp + Strafe. Daraus rechnet die
     Engine Platzierungen, Tipp-Bonus und Abendsieg — hier wird nichts addiert. */
  function ergebnisEintragen(vorgabe) {
    var c = S.computed();
    var affen = c.standings('all', { includeEmpty: true });
    if (affen.length < 2) { S.toast('Zu wenig Affen', 'Mindestens zwei, sonst ist es Solitär.', 'punsch'); return; }

    var spielFeld = U.Select({
      label: 'Spiel', value: (vorgabe && vorgabe.gameId) || (c.shelf[0] && c.shelf[0].id),
      options: c.shelf.map(function (g) { return { value: g.id, label: g.title + (g.lowerWins ? ' · weniger gewinnt' : '') }; })
    });
    var datumFeld = U.Input({ label: 'Datum', type: 'date', value: (vorgabe && vorgabe.date) || S.heute(), icon: 'calendar-days' });
    var dauerFeld = U.Input({ label: 'Dauer', value: '', inputMode: 'numeric', suffix: 'min', icon: 'clock' });

    var zeilen = affen.map(function (a) {
      var punkte = U.Input({ size: 'sm', inputMode: 'numeric', placeholder: '—' });
      var tipp = U.Input({ size: 'sm', inputMode: 'numeric', placeholder: '—' });
      var strafe = { on: false };
      var box = U.Checkbox({ label: '', onChange: function (e) { strafe.on = e.target.checked; } });
      return { affe: a, punkte: punkte, tipp: tipp, strafe: strafe, box: box };
    });

    SH.overlay(function (close) {
      return U.Dialog({
        tone: 'neon', width: 620, eyebrow: 'Ergebnis', title: 'Wer hat wie viel?', onClose: close,
        children: [
          h('div.sa-cols.sa-cols--half', null, spielFeld, datumFeld),
          dauerFeld,
          h('div.sa-card.sa-card--flush', null,
            h('div.sa-thead', { style: { gridTemplateColumns: '1fr 92px 92px 64px' } },
              h('span', 'Affe'), h('span', 'Punkte'), h('span', 'Tipp'), h('span', 'Strafe')),
            zeilen.map(function (z) {
              return h('div.sa-trow', { style: { gridTemplateColumns: '1fr 92px 92px 64px' } },
                h('span.sa-inline', null,
                  U.PlayerAvatar({ name: z.affe.name, seat: z.affe.seat, size: 'sm' }),
                  h('span.sa-strong.sa-truncate', z.affe.name)),
                z.punkte, z.tipp, z.box);
            })),
          h('span.sa-meta', 'Leer lassen heißt: war nicht dabei. Strafe kostet ' + SA.STRAFE_POINTS + ' Punkte.')
        ],
        footer: [
          U.Button({ children: 'Abbrechen', variant: 'ghost', onClick: close }),
          U.Button({
            children: 'Speichern', iconLeft: 'check',
            onClick: function () {
              var spielId = spielFeld.select.value;
              var spiel = c.shelf.filter(function (g) { return g.id === spielId; })[0];
              var datum = datumFeld.input.value || S.heute();
              var results = zeilen.filter(function (z) { return z.punkte.input.value.trim() !== ''; })
                .map(function (z) {
                  var r = { playerId: z.affe.id, score: Number(z.punkte.input.value) };
                  if (z.tipp.input.value.trim() !== '') r.tip = Number(z.tipp.input.value);
                  if (z.strafe.on) r.strafe = true;
                  return r;
                });
              if (results.length < 2) { S.toast('Zahlen, bitte.', 'Mindestens zwei Affen brauchen ein Ergebnis.', 'punsch'); return; }

              var dauer = Number(dauerFeld.input.value) || null;
              var neuesSpiel = {
                id: SA.uid('g'), gameId: spiel.id, title: spiel.title,
                lowerWins: !!spiel.lowerWins, durationMin: dauer, results: results
              };
              // Wertung sofort, damit die Meldung den Sieger nennen kann.
              var ev = SA.evalGame(neuesSpiel);
              var siegerId = Object.keys(ev).filter(function (pid) { return ev[pid].place === 1; })[0];
              var sieger = c.playerById[siegerId];

              S.update(function (doc) {
                var abend = (doc.nights || []).filter(function (n) { return n.date === datum && n.status !== 'geplant'; })[0]
                  || (doc.nights || []).filter(function (n) { return n.date === datum; })[0];
                if (!abend) {
                  abend = {
                    id: SA.uid('n'), date: datum, title: 'Spieleabend', hostId: results[0].playerId,
                    status: 'fertig', dabei: results.map(function (r) { return r.playerId; }),
                    snacks: [], games: []
                  };
                  doc.nights.push(abend);
                }
                abend.status = abend.status === 'laeuft' ? 'laeuft' : 'fertig';
                abend.games = (abend.games || []).concat([neuesSpiel]);
                results.forEach(function (r) {
                  if ((abend.dabei || []).indexOf(r.playerId) < 0) abend.dabei = (abend.dabei || []).concat([r.playerId]);
                });
              }, {
                summary: spiel.title + ' am ' + SA.fmtDate(datum) + ' eingetragen',
                entries: [{
                  icon: 'edit_note', tone: 'banana',
                  text: spiel.title + ' am ' + SA.fmtDate(datum) + ' eingetragen. Sieger: ' + (sieger ? sieger.name : '—') + '.',
                  to: results.length + ' Affen'
                }]
              }).then(function () {
                close();
                S.toast('Ergebnis steht', (sieger ? sieger.name : 'Jemand') + ' hat ' + spiel.title + ' gewonnen. Der Rest darf sich schämen.', 'banana');
              }).catch(function () { /* Meldung kam schon vom Store */ });
            }
          })
        ]
      });
    });
  }

  // ── Affe hinzufügen ──────────────────────────────────────────────────────
  /* Sitzfarben sind Identität: sechs Stück, jede höchstens einmal vergeben.
     Ist keine frei, muss erst jemand ins Archiv. */
  function affeHinzufuegen() {
    var c = S.computed();
    var belegt = c.players.filter(function (p) { return !p.archived; }).map(function (p) { return Number(p.seat); });
    var frei = SA.freeSeats(c.players);

    var nameFeld = U.Input({ label: 'Name', placeholder: 'z. B. Ana Sol' });
    var seatFeld = U.Select({
      label: 'Sitzfarbe', value: String(frei[0] || ''),
      hint: frei.length ? undefined : 'Alle sechs Farben sind belegt. Erst einer geht, dann kommt einer.',
      options: (frei.length ? [] : [{ value: '', label: 'Keine frei' }]).concat(SA.SEATS.map(function (s) {
        return { value: String(s), label: 'Seat ' + s + (belegt.indexOf(s) >= 0 ? ' · belegt' : '') };
      }))
    });
    var codeFeld = U.PinInput({ label: 'Eigener Code (vier Ziffern)', length: 4, hint: 'Damit trägt der Affe selbst ein. Kann später geändert werden.' });

    SH.overlay(function (close) {
      var vorschau = h('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: 'var(--space-5)', padding: 'var(--space-5)',
          background: 'var(--surface-inset)', border: '1px solid var(--line)', borderRadius: 'var(--radius-control)'
        }
      });
      function zeichneVorschau() {
        var name = nameFeld.input.value.trim() || 'Neuer Affe';
        var seat = Number(seatFeld.select.value) || 1;
        var doppelt = belegt.indexOf(seat) >= 0;
        window.SA_DOM.mount(vorschau,
          U.PlayerAvatar({ name: name, seat: seat, size: 'lg' }),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px' } },
            h('span.sa-strong', name),
            h('span.sa-meta', { style: { color: doppelt ? 'var(--punsch-400)' : 'var(--text-faint)' } },
              doppelt ? 'Diese Farbe gehört schon jemandem. Zwei gleiche Affen gibt’s nicht.'
                      : 'So sieht er überall aus. Für immer.')));
      }
      nameFeld.input.addEventListener('input', zeichneVorschau);
      seatFeld.select.addEventListener('change', zeichneVorschau);
      zeichneVorschau();

      return U.Dialog({
        tone: 'neon', width: 480, eyebrow: 'Neuer Affe', title: 'Wer will verlieren?', onClose: close,
        children: [nameFeld, seatFeld, codeFeld, vorschau],
        footer: [
          U.Button({ children: 'Abbrechen', variant: 'ghost', onClick: close }),
          U.Button({
            children: frei.length ? 'Hinzufügen' : 'Keine Sitzfarbe frei',
            iconLeft: 'user-plus', disabled: !frei.length,
            onClick: function () {
              var name = nameFeld.input.value.trim();
              var seat = Number(seatFeld.select.value);
              if (!name) { S.toast('Name fehlt', 'Namenlose Affen verlieren nur halb so schön.', 'punsch'); return; }
              if (!seat || belegt.indexOf(seat) >= 0) { S.toast('Farbe belegt', 'Zwei gleiche Affen gibt’s nicht.', 'punsch'); return; }
              var code = (codeFeld.querySelectorAll('input.is-filled').length === 4)
                ? Array.prototype.map.call(codeFeld.querySelectorAll('input'), function (i) { return i.value; }).join('') : null;
              var id = name.toLowerCase().replace(/[^a-z0-9]/g, '') || SA.uid('affe');

              S.update(function (doc) {
                if ((doc.players || []).some(function (p) { return p.id === id; })) {
                  S.toast('Gibt’s schon', 'Ein Affe mit diesem Namen steht bereits im Block.', 'punsch');
                  return false;
                }
                doc.players.push({ id: id, name: name, short: SA.initials(name), seat: seat, admin: false, archived: false });
              }, {
                summary: 'Affe ' + name + ' angelegt (Seat ' + seat + ')',
                entries: [{ icon: 'person_add', tone: 'slime', text: 'Neuer Affe: ' + name + '.', to: 'Seat ' + seat }]
              }).then(function (res) {
                if (res === null) return;
                if (code) {
                  if (window.SA_API.hasBackend()) window.SA_API.setCode(id, code).catch(function () { /* später im Admin */ });
                  else S.setDemoCode(id, code);
                }
                close();
                S.toast('Willkommen', name + ' ist dabei. Viel Glück braucht’s trotzdem.', 'slime');
              }).catch(function () { /* Meldung kam schon vom Store */ });
            }
          })
        ]
      });
    });
  }

  window.SA_DIALOGS = {
    abendPlanen: abendPlanen,
    ergebnisEintragen: ergebnisEintragen,
    affeHinzufuegen: affeHinzufuegen,
    standardSnacks: standardSnacks
  };
})();
