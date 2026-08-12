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
              if (dabei.length < 2) { S.toast('Zu wenig', 'Alleine spielt sich das schlecht.', 'punsch'); return; }
              S.update(function (doc) {
                doc.nights = doc.nights || [];
                doc.nights.push({
                  id: SA.uid('n'), date: datum, title: titel, hostId: dabei[0],
                  status: 'geplant', zeit: zeitFeld.input.value || '20:00',
                  gameId: spielFeld.select.value || null,   // gemerkt fürs Starten
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

  // ── Startaufstellung ─────────────────────────────────────────────────────
  /* Nur die beiden Spiele mit eigenem Werkzeug — ohne sie im Regal sind die
     Spielmodule nicht erreichbar. Alles andere trägt die Runde selbst ein.
     Dazu eine laufende Saison, damit die Rangliste einen Zeitraum hat. */
  function startaufstellung() {
    var c = S.computed();
    var fehlende = SA.modulSpiele().filter(function (g) {
      return !(c.data.games || []).some(function (x) { return x.id === g.id || x.title === g.title; });
    });
    var brauchtSaison = !(c.data.seasons || []).length;
    if (!fehlende.length && !brauchtSaison) {
      S.toast('Steht schon', 'Catan und Wizard sind im Regal, die Saison läuft.', 'neutral');
      return;
    }
    var saison = SA.startSaison(S.heute());

    S.update(function (doc) {
      doc.games = (doc.games || []).concat(fehlende);
      if (brauchtSaison) doc.seasons = (doc.seasons || []).concat([saison]);
    }, {
      summary: 'Startaufstellung angelegt',
      entries: fehlende.map(function (g) {
        return { icon: 'extension', tone: 'slime', text: g.title + ' ins Regal gestellt.', to: 'Modul' };
      }).concat(brauchtSaison
        ? [{ icon: 'calendar-days', tone: 'slime', text: saison.name + ' angelegt.', to: SA.fmtDate(saison.start) + '–' + SA.fmtDate(saison.end) }]
        : [])
    }).then(function () {
      S.toast('Steht', (fehlende.length ? fehlende.map(function (g) { return g.title; }).join(' und ') + ' im Regal. ' : '') +
        'Der Rest kommt über „Spiel hinzufügen".', 'slime');
    }).catch(function () { /* Meldung kam schon vom Store */ });
  }

  // ── Spiel hinzufügen ─────────────────────────────────────────────────────
  function spielHinzufuegen() {
    var c = S.computed();
    var genres = ['Karten', 'Strategie', 'Party', 'Würfel', 'Sonst'];

    var nameFeld = U.Input({ label: 'Wie heißt es?', placeholder: 'z. B. Skull King' });
    var genreFeld = U.Select({ label: 'Genre', value: 'Karten', options: genres });
    var dauerFeld = U.Input({ label: 'Dauer', value: '45', inputMode: 'numeric', suffix: 'min', icon: 'clock' });
    var minFeld = U.Input({ label: 'Mindestens', value: '3', inputMode: 'numeric', suffix: 'Affen' });
    var maxFeld = U.Input({ label: 'Höchstens', value: '6', inputMode: 'numeric', suffix: 'Affen' });
    var wertung = U.Select({
      label: 'Wertung', value: 'hi',
      options: [{ value: 'hi', label: 'Höchste Punktzahl gewinnt' }, { value: 'lo', label: 'Niedrigste gewinnt' }]
    });

    SH.overlay(function (close) {
      return U.Dialog({
        tone: 'neon', width: 520, eyebrow: 'Neues Spiel', title: 'Was kommt ins Regal?', onClose: close,
        children: [
          nameFeld,
          h('div.sa-cols.sa-cols--half', null, genreFeld, dauerFeld),
          h('div.sa-cols.sa-cols--half', null, minFeld, maxFeld),
          wertung,
          h('span.sa-meta', 'Eigenes Werkzeug haben nur Catan und Wizard. Alles andere wird über „Ergebnis eintragen" gewertet.')
        ],
        footer: [
          U.Button({ children: 'Abbrechen', variant: 'ghost', onClick: close }),
          U.Button({
            children: 'Ins Regal', iconLeft: 'plus',
            onClick: function () {
              var name = nameFeld.input.value.trim();
              if (!name) { S.toast('Name fehlt', 'Namenlose Spiele findet später niemand wieder.', 'punsch'); return; }
              if ((c.data.games || []).some(function (g) { return g.title.toLowerCase() === name.toLowerCase(); })) {
                S.toast('Steht schon da', name + ' ist bereits im Regal.', 'punsch');
                return;
              }
              var min = Number(minFeld.input.value) || 2;
              var max = Number(maxFeld.input.value) || Math.max(min, 6);
              var id = name.toLowerCase().replace(/[^a-z0-9]/g, '') || SA.uid('g');

              S.update(function (doc) {
                doc.games = (doc.games || []).concat([{
                  id: id, title: name, genre: genreFeld.select.value,
                  dauerMin: Number(dauerFeld.input.value) || null,
                  minAffen: min, maxAffen: Math.max(min, max),
                  lowerWins: wertung.select.value === 'lo', modul: null
                }]);
              }, {
                summary: name + ' ins Regal gestellt',
                entries: [{ icon: 'dices', tone: 'slime', text: name + ' ins Regal gestellt.', to: genreFeld.select.value }]
              }).then(function () {
                close();
                S.toast('Steht im Regal', name + ' ist drin. Jetzt muss es nur noch jemand rausholen.', 'slime');
              }).catch(function () { /* Meldung kam schon vom Store */ });
            }
          })
        ]
      });
    });
  }

  // ── Ergebnis eintragen ───────────────────────────────────────────────────
  /* Eine Partie: ein Spiel, je Affe die Punktzahl daraus. Plätze, Siegpunkte
     und Abendsieg rechnet die Engine — hier wird nichts addiert. Getippt wird
     nur bei Wizard; dafür gibt es den Block der Wahrheit.
     Mit {abendId} landet die Partie im laufenden Abend, und gefragt wird nur,
     wer heute am Tisch sitzt. */
  function ergebnisEintragen(vorgabe) {
    var c = S.computed();
    var laufend = vorgabe && vorgabe.abendId
      ? (c.data.nights || []).filter(function (n) { return n.id === vorgabe.abendId; })[0]
      : null;
    var affen = c.standings('all', { includeEmpty: true });
    if (laufend) {
      affen = affen.filter(function (a) { return (laufend.dabei || []).indexOf(a.id) >= 0; });
    }
    if (affen.length < 2) { S.toast('Zu wenig Affen', 'Mindestens zwei, sonst ist es Solitär.', 'punsch'); return; }
    // Ohne Spiel im Regal hat die Auswahl keinen Eintrag — und das Speichern
    // lief vorher in einen Fehler, statt das zu sagen.
    if (!c.shelf.length) {
      S.toast('Leeres Regal', 'Erst ein Spiel anlegen — unter Spiele.', 'punsch');
      S.navigate('spiele');
      return;
    }

    var spielFeld = U.Select({
      label: 'Spiel', value: (vorgabe && vorgabe.gameId) || (c.shelf[0] && c.shelf[0].id),
      options: c.shelf.map(function (g) { return { value: g.id, label: g.title + (g.lowerWins ? ' · weniger gewinnt' : '') }; })
    });
    var datumFeld = U.Input({ label: 'Datum', type: 'date', value: (vorgabe && vorgabe.date) || S.heute(), icon: 'calendar-days' });
    // Im laufenden Abend steht das Datum fest — es ist ja heute Abend.
    var datumZeile = laufend
      ? h('span.sa-meta', 'Zählt zum laufenden Abend „' + (laufend.title || 'Spieleabend') + '".')
      : datumFeld;
    var dauerFeld = U.Input({ label: 'Dauer', value: '', inputMode: 'numeric', suffix: 'min', icon: 'clock' });

    var zeilen = affen.map(function (a) {
      var punkte = U.Input({ size: 'sm', inputMode: 'numeric', placeholder: '—' });
      return { affe: a, punkte: punkte };
    });

    SH.overlay(function (close) {
      return U.Dialog({
        tone: 'neon', width: 620, eyebrow: laufend ? 'Partie' : 'Nachtrag',
        title: 'Wer hat wie viel?', onClose: close,
        children: [
          laufend ? spielFeld : h('div.sa-cols.sa-cols--half', null, spielFeld, datumFeld),
          laufend ? datumZeile : null,
          dauerFeld,
          h('div.sa-card.sa-card--flush', null,
            h('div.sa-thead', { style: { gridTemplateColumns: '1fr 92px' } },
              h('span', 'Affe'), h('span', 'Punkte')),
            zeilen.map(function (z) {
              return h('div.sa-trow', { style: { gridTemplateColumns: '1fr 92px' } },
                h('span.sa-inline', null,
                  U.PlayerAvatar({ name: z.affe.name, seat: z.affe.seat, size: 'sm' }),
                  h('span.sa-strong.sa-truncate', z.affe.name)),
                z.punkte);
            })),
          h('span.sa-meta', 'Leer lassen heißt: war nicht dabei. Die Plätze rechnet die App daraus.')
        ],
        footer: [
          U.Button({ children: 'Abbrechen', variant: 'ghost', onClick: close }),
          U.Button({
            children: 'Speichern', iconLeft: 'check',
            onClick: function () {
              var spielId = spielFeld.select.value;
              var spiel = c.shelf.filter(function (g) { return g.id === spielId; })[0] || c.shelf[0];
              if (!spiel) { S.toast('Leeres Regal', 'Erst ein Spiel anlegen — unter Spiele.', 'punsch'); return; }
              var datum = laufend ? laufend.date : (datumFeld.input.value || S.heute());
              var results = zeilen.filter(function (z) { return z.punkte.input.value.trim() !== ''; })
                .map(function (z) {
                  return { playerId: z.affe.id, score: Number(z.punkte.input.value) };
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
                var abend = laufend
                  ? (doc.nights || []).filter(function (n) { return n.id === laufend.id; })[0]
                  : (doc.nights || []).filter(function (n) { return n.date === datum && n.status !== 'geplant'; })[0]
                    || (doc.nights || []).filter(function (n) { return n.date === datum; })[0];
                if (!abend) {
                  abend = {
                    id: SA.uid('n'), date: datum, title: 'Spieleabend', hostId: results[0].playerId,
                    status: 'fertig', dabei: results.map(function (r) { return r.playerId; }),
                    snacks: [], games: []
                  };
                  doc.nights.push(abend);
                }
                // Ein laufender Abend bleibt laufend; ein nachgetragener ist fertig.
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
  /* Sitzfarben sind Identität: jede höchstens einmal vergeben. Ist keine
     frei, muss erst jemand ins Archiv — oder zwei tauschen im Admin. */
  function affeHinzufuegen() {
    var c = S.computed();
    var belegt = c.players.filter(function (p) { return !p.archived; }).map(function (p) { return Number(p.seat); });
    var frei = SA.freeSeats(c.players);

    var nameFeld = U.Input({ label: 'Name', placeholder: 'z. B. Ana Sol' });
    var seatFeld = U.Select({
      label: 'Sitzfarbe', value: String(frei[0] || ''),
      hint: frei.length ? undefined : 'Alle ' + SA.SEATS.length + ' Farben sind belegt. Erst einer geht, dann kommt einer.',
      options: (frei.length ? [] : [{ value: '', label: 'Keine frei' }]).concat(SA.SEATS.map(function (s) {
        return { value: String(s), label: SA.seatName(s) + (belegt.indexOf(s) >= 0 ? ' · belegt' : '') };
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
                      : 'So sieht er überall aus. Später im Admin änderbar.')));
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
                summary: 'Affe ' + name + ' angelegt (' + SA.seatName(seat) + ')',
                entries: [{ icon: 'person_add', tone: 'slime', text: 'Neuer Affe: ' + name + '.', to: SA.seatName(seat) }]
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

  // ── Abend starten ────────────────────────────────────────────────────────
  /* Der Abend fängt leer an: Wer ist dabei, wie heißt er. Die Partien kommen
     einzeln dazu, solange er läuft — kein Spiel wird auf Vorrat angelegt. */
  function abendStarten(vorlage) {
    var c = S.computed();
    var affen = c.standings('all', { includeEmpty: true });
    if (affen.length < 2) {
      S.toast('Zu wenig Affen', 'Mindestens zwei, sonst ist es Solitär.', 'punsch');
      return;
    }
    if (c.liveNight) {
      S.toast('Läuft schon', 'Erst den laufenden Abend beenden.', 'punsch');
      S.navigate('abend');
      return;
    }

    var dabei = (vorlage && (vorlage.dabei || []).length)
      ? vorlage.dabei.slice()
      : affen.map(function (a) { return a.id; });
    var titelFeld = U.Input({
      label: 'Wie heißt der Abend?', placeholder: 'z. B. Dienstags-Debakel',
      value: (vorlage && vorlage.title) || ''
    });

    SH.overlay(function (close) {
      var tagRow = h('div.sa-inline');
      var hinweis = h('span.sa-meta');
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
        hinweis.textContent = dabei.length < 2
          ? 'Mindestens zwei. Alleine spielt sich das schlecht.'
          : SA.plural(dabei.length, 'Affe', 'Affen') + ' am Tisch. Platz 1 bis 4 bringen 4/3/2/1 Punkte, ab dem fünften nichts.';
      }
      zeichneTags();

      return U.Dialog({
        tone: 'neon', width: 520, eyebrow: 'Es geht los', title: 'Wer sitzt heute am Tisch?', onClose: close,
        children: [
          titelFeld,
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' } },
            h('span.sa-label', 'Wer ist dabei?'), tagRow, hinweis)
        ],
        footer: [
          U.Button({ children: 'Abbrechen', variant: 'ghost', onClick: close }),
          U.Button({
            children: 'Abend starten', iconLeft: 'play',
            onClick: function () {
              if (dabei.length < 2) { S.toast('Zu wenig', 'Alleine spielt sich das schlecht.', 'punsch'); return; }
              var titel = titelFeld.input.value.trim() || 'Spieleabend';
              S.update(function (doc) {
                doc.nights = doc.nights || [];
                // Ein geplanter Abend wird gestartet statt verdoppelt.
                var n = vorlage ? doc.nights.filter(function (x) { return x.id === vorlage.id; })[0] : null;
                if (!n) {
                  n = { id: SA.uid('n'), date: S.heute(), snacks: [], games: [] };
                  doc.nights.push(n);
                }
                n.title = titel;
                n.date = S.heute();
                n.status = 'laeuft';
                n.startedAt = S.uhr();
                n.dabei = dabei.slice();
                n.hostId = n.hostId || dabei[0];
                n.games = n.games || [];
              }, {
                summary: 'Abend „' + titel + '" gestartet',
                entries: [{ icon: 'play', tone: 'punsch', text: 'Abend „' + titel + '" läuft.', to: S.uhr() }]
              }).then(function (res) {
                close();
                if (res !== null) {
                  S.navigate('abend');
                  S.toast('Läuft', titel + ' hat begonnen. Jetzt zählt es.', 'punsch');
                }
              }).catch(function () { /* Meldung kam schon vom Store */ });
            }
          })
        ]
      });
    });
  }

  // ── Abend beenden ────────────────────────────────────────────────────────
  /* Schluss ist, wenn ihr sagt, dass Schluss ist. Danach steht die Auswertung
     auf dem Abend-Screen, und die Partien wandern in die Gesamttabelle. */
  function abendBeenden(abend) {
    var c = S.computed();
    var partien = (abend.games || []).length;
    if (!partien) {
      S.toast('Nichts gespielt', 'Ohne Partie gibt es nichts auszuwerten.', 'punsch');
      return;
    }
    var ev = SA.evalNight(abend);
    var sieger = ev.winners.map(function (pid) { return (c.playerById[pid] || {}).name; }).filter(Boolean);

    SH.overlay(function (close) {
      return U.Dialog({
        tone: 'neon', width: 460, eyebrow: 'Feierabend', title: 'Abend beenden?', onClose: close,
        children: [
          h('span.sa-body', SA.plural(partien, 'Partie', 'Partien') + ' gespielt. ' +
            (sieger.length ? sieger.join(' und ') + ' ' + (sieger.length > 1 ? 'führen' : 'führt') + '.' : 'Noch niemand vorn.')),
          h('span.sa-meta', 'Danach kommt die Auswertung, und die Punkte stehen in der Gesamttabelle. Nachträglich ändern geht nur noch im Admin.')
        ],
        footer: [
          U.Button({ children: 'Weiterspielen', variant: 'ghost', onClick: close }),
          U.Button({
            children: 'Beenden', iconLeft: 'check',
            onClick: function () {
              S.update(function (doc) {
                var n = doc.nights.filter(function (x) { return x.id === abend.id; })[0];
                if (!n) return false;
                n.status = 'fertig';
                n.endedAt = S.uhr();
              }, {
                summary: 'Abend „' + abend.title + '" beendet',
                entries: [{
                  icon: 'flag', tone: 'slime',
                  text: 'Abend „' + abend.title + '" beendet. Sieger: ' + (sieger.join(' & ') || '—') + '.',
                  to: SA.plural(partien, 'Partie', 'Partien')
                }]
              }).then(function () {
                close();
                S.toast('Feierabend', sieger.length
                  ? sieger.join(' und ') + ' hat den Abend geholt. Der Rest weiß, warum.'
                  : 'Abend beendet. Unentschieden ist auch ein Ergebnis.', 'slime');
              }).catch(function () { /* Meldung kam schon vom Store */ });
            }
          })
        ]
      });
    });
  }

  // ── Sitzfarbe ändern ─────────────────────────────────────────────────────
  /* Die Sitzfarbe ist Identität: Avatar, Tag, Balken, alles hängt daran.
     Deshalb ein fester Satz Farben, jede höchstens einmal — und wer die Farbe
     eines anderen nimmt, tauscht mit ihm, statt sie ihm wegzunehmen. */
  function sitzfarbeAendern(spielerId) {
    var c = S.computed();
    var p = c.playerById[spielerId];
    if (!p) return;
    var vergabe = SA.seatVergabe(c.players);
    var alt = Number(p.seat);
    var gewaehlt = alt;

    SH.overlay(function (close) {
      var palette = h('div.sa-palette');
      var vorschau = h('div.sa-farbvorschau');

      function zeichnen() {
        window.SA_DOM.mount(palette, SA.SEATS.map(function (s) {
          var inhaber = vergabe[s];
          var eigene = inhaber && inhaber.id === p.id;
          return h('button', {
            type: 'button',
            class: ['sa-palette__feld', gewaehlt === s && 'is-gewaehlt'],
            style: { '--sa-seat': U.seatVar(s) },
            'aria-pressed': gewaehlt === s ? 'true' : 'false',
            title: SA.seatName(s),
            'aria-label': SA.seatName(s) + (inhaber ? ' — ' + (eigene ? 'deine Farbe' : inhaber.name) : ' — frei'),
            onclick: function () { gewaehlt = s; zeichnen(); }
          },
            h('span.sa-palette__punkt'),
            h('span.sa-palette__name', SA.seatName(s)),
            h('span.sa-palette__wer', inhaber ? (eigene ? 'du' : SA.shortCode(inhaber)) : 'frei'));
        }));

        var tauschMit = vergabe[gewaehlt] && vergabe[gewaehlt].id !== p.id ? vergabe[gewaehlt] : null;
        window.SA_DOM.mount(vorschau, [
          U.PlayerAvatar({ name: p.name, seat: gewaehlt, size: 'xl' }),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 } },
            h('span.sa-strong', p.name + ' · ' + SA.seatName(gewaehlt)),
            h('span.sa-meta', gewaehlt === alt ? 'Die aktuelle Farbe.'
              : tauschMit ? 'Diese Farbe hat ' + tauschMit.name + '. Ihr tauscht.'
              : 'Frei. Ab dann überall in dieser Farbe.'))
        ]);
      }
      zeichnen();

      return U.Dialog({
        tone: 'neon', width: 480, eyebrow: 'Sitzfarbe', title: p.name + ', welche Farbe?', onClose: close,
        children: [
          h('span.sa-body', SA.SEATS.length + ' Farben, jede höchstens einmal. Sie steckt in Avatar, Tag und jedem Balken.'),
          palette,
          vorschau
        ],
        footer: [
          U.Button({ children: 'Abbrechen', variant: 'ghost', onClick: close }),
          U.Button({
            children: 'Übernehmen', iconLeft: 'check',
            onClick: function () {
              if (gewaehlt === alt) { close(); return; }
              var tauschMit = vergabe[gewaehlt] && vergabe[gewaehlt].id !== p.id ? vergabe[gewaehlt] : null;

              S.update(function (doc) {
                var x = doc.players.filter(function (y) { return y.id === p.id; })[0];
                if (!x) return false;
                if (tauschMit) {
                  var y = doc.players.filter(function (z) { return z.id === tauschMit.id; })[0];
                  if (y) y.seat = alt;
                }
                x.seat = gewaehlt;
              }, {
                summary: 'Sitzfarbe von ' + p.name + ' geändert',
                entries: [{
                  icon: 'palette', tone: 'slime',
                  text: tauschMit
                    ? p.name + ' und ' + tauschMit.name + ' haben die Sitzfarben getauscht.'
                    : 'Sitzfarbe von ' + p.name + ' geändert.',
                  from: SA.seatName(alt), to: SA.seatName(gewaehlt)
                }]
              }).then(function () {
                close();
                S.toast('Neue Farbe', tauschMit
                  ? p.name + ' und ' + tauschMit.name + ' haben getauscht. Gewöhnungssache.'
                  : p.name + ' ist jetzt ' + SA.seatName(gewaehlt) + '. Steht überall.', 'slime');
              }).catch(function () { /* Meldung kam schon vom Store */ });
            }
          })
        ]
      });
    });
  }

  window.SA_DIALOGS = {
    abendPlanen: abendPlanen,
    sitzfarbeAendern: sitzfarbeAendern,
    startaufstellung: startaufstellung,
    spielHinzufuegen: spielHinzufuegen,
    abendStarten: abendStarten,
    abendBeenden: abendBeenden,
    ergebnisEintragen: ergebnisEintragen,
    affeHinzufuegen: affeHinzufuegen,
    standardSnacks: standardSnacks
  };
})();
