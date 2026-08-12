/* SpieleAffen — Spielmodule.
 * Aus ui_kits/dashboard/ModulesScreen.jsx.
 *
 * Manche Spiele verdienen eigenes Werkzeug statt generischer Punkteingabe:
 *   Catan  · Würfelstatistik   — 2–12 antippen, Balken gegen die Erwartung,
 *                                7er-Quote, Räuber-Zähler je Affe
 *   Wizard · Block der Wahrheit — Gesagt/Gemacht je Runde, Wertung automatisch,
 *                                Wahrheitsquote je Affe
 * Beide enden mit einer Urteil-Karte, die die Zahlen laut vorliest.
 */
(function () {
  'use strict';
  var h = window.h, U = window.SA_UI, SA = window.SA, S = window.SA_STORE, T = window.SA_TEASE, SH = window.SA_SHELL;

  var modul = 'catan';
  var WAYS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
  var NUMBERS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  // ── Sitzungen ─────────────────────────────────────────────────────────────
  function aktuelle(c, art) {
    var liste = ((c.data.modules || {})[art] || {}).sessions || [];
    return liste[liste.length - 1] || null;
  }

  function neueSitzung(art, affen) {
    S.update(function (doc) {
      doc.modules = doc.modules || {};
      doc.modules[art] = doc.modules[art] || { sessions: [] };
      doc.modules[art].sessions.push(art === 'catan'
        ? { id: SA.uid('c'), date: S.heute(), counts: {}, raeuber: {} }
        : {
            id: SA.uid('w'), date: S.heute(),
            players: affen.slice(0, 6).map(function (a) { return a.id; }),
            runden: [], aktiveRunde: 1,
            // 60 Karten, restlos verteilt — die Rundenzahl hängt an der Anzahl.
            rundenGesamt: SA.wizardRunden(Math.min(affen.length, 6))
          });
    }, {
      summary: 'Neue Modul-Sitzung (' + art + ')',
      entries: [{ icon: 'extension', tone: 'slime', text: 'Neue Sitzung im Modul ' + (art === 'catan' ? 'Würfelstatistik' : 'Block der Wahrheit') + '.' }]
    });
  }

  // ══ Catan · Würfelstatistik ══════════════════════════════════════════════
  function catan(c, affen) {
    var sitzung = aktuelle(c, 'catan');
    if (!sitzung) return leer('Würfelstatistik', 'Noch keine Sitzung. Der Räuber wartet.', function () { neueSitzung('catan', affen); });

    var counts = sitzung.counts || {};
    var gesamt = NUMBERS.reduce(function (s, n) { return s + (counts[n] || 0); }, 0);
    var siebener = counts[7] || 0;
    var siebenQuote = gesamt ? siebener / gesamt : 0;

    // Größte relative Abweichung von der Erwartung — daraus wird das Urteil.
    var maxAbw = 0;
    NUMBERS.forEach(function (n) {
      var exp = gesamt * WAYS[n] / 36;
      if (exp < 1) return;
      maxAbw = Math.max(maxAbw, Math.abs((counts[n] || 0) - exp) / exp);
    });
    var urteil = T.teaseWuerfel(gesamt, maxAbw, siebenQuote);

    function wuerfeln(n) {
      S.update(function (doc) {
        var s = letzteSitzung(doc, 'catan');
        if (!s) return false;
        s.counts = s.counts || {};
        s.counts[n] = (s.counts[n] || 0) + 1;
      }, { summary: 'Wurf ' + n + ' notiert', debounce: 1500 });
    }
    function raeuber(pid, by) {
      S.update(function (doc) {
        var s = letzteSitzung(doc, 'catan');
        if (!s) return false;
        s.raeuber = s.raeuber || {};
        s.raeuber[pid] = Math.max(0, (s.raeuber[pid] || 0) + by);
      }, { summary: 'Räuber-Zähler geändert', debounce: 1500 });
    }

    return h('div.sa-cols.sa-cols--side', null,
      h('div.sa-stack', null,
        U.Card({
          eyebrow: 'Catan · Sitzung vom ' + SA.fmtDate(sitzung.date),
          title: 'Würfelstatistik',
          action: U.Badge({ children: gesamt + ' Würfe', tone: gesamt ? 'slime' : 'neutral', size: 'sm' }),
          children: [
            h('span.sa-body', 'Antippen, was gefallen ist. Die gestrichelte Linie ist, was fallen müsste.'),
            U.DiceHistogram({ counts: counts, height: 170, onLog: wuerfeln })
          ]
        }),
        U.Card({
          padding: '0', title: 'Räuber',
          action: U.Badge({ children: siebener + '× die Sieben', tone: siebener ? 'punsch' : 'neutral', size: 'sm' }),
          children: affen.length ? affen.map(function (a) {
            var n = (sitzung.raeuber || {})[a.id] || 0;
            return h('div.sa-row', null,
              U.PlayerAvatar({ name: a.name, seat: a.seat, size: 'sm' }),
              h('span.sa-strong', { style: { flex: 1 } }, a.name),
              U.IconButton({ icon: 'minus', label: a.name + ' Räuber weniger', variant: 'outline', size: 'sm', onClick: function () { raeuber(a.id, -1); } }),
              h('span.sa-num', { style: { minWidth: '36px', textAlign: 'center', fontSize: '19px', color: n ? 'var(--punsch-400)' : 'var(--text-faint)' } }, String(n)),
              U.IconButton({ icon: 'plus', label: a.name + ' Räuber mehr', variant: 'outline', size: 'sm', onClick: function () { raeuber(a.id, 1); } }));
          }) : h('div.sa-empty', null, h('span.sa-empty__text', 'Keine Affen, kein Räuber.'))
        })),

      h('div.sa-stack', null,
        U.StatTile({
          label: '7er-Quote', value: gesamt ? Math.round(siebenQuote * 100) + '%' : '—',
          unit: 'erwartet 17%', icon: 'skull', tone: siebenQuote > 0.22 ? 'punsch' : 'neutral'
        }),
        U.StatTile({ label: 'Würfe insgesamt', value: gesamt, icon: 'casino' }),
        U.Card({
          tone: 'neon', eyebrow: 'Urteil', title: 'Was die Würfel sagen',
          children: [
            U.Tease({ tone: urteil.tone, children: urteil.text }),
            h('span.sa-body', gesamt < 12
              ? 'Ab zwölf Würfen wird geurteilt. Vorher ist alles Zufall — auch statistisch.'
              : 'Größte Abweichung: ' + Math.round(maxAbw * 100) + '% über der Erwartung.')
          ]
        }),
        U.Card({
          tone: 'sunken', eyebrow: 'Sitzung', title: 'Neu anfangen?',
          children: [
            h('span.sa-body', 'Die alte Sitzung bleibt im Dokument stehen. Nichts geht verloren.'),
            U.Button({ children: 'Neue Sitzung', size: 'sm', variant: 'secondary', iconLeft: 'plus', onClick: function () { neueSitzung('catan', affen); } })
          ]
        }))
    );
  }

  // ══ Wizard · Block der Wahrheit ══════════════════════════════════════════
  /* Der Entwurf ist die laufende, noch nicht gewertete Runde. Er lebt außerhalb
     der Zeichenfunktion, damit ein Neuzeichnen die halbe Eingabe nicht wegwirft
     — und muss genau deshalb zurückgesetzt werden, BEVOR der Speicher die
     nächste Runde anstößt. Stand er noch, trug die neue Runde die alten
     Ansagen: in der Tabelle „Steht", obwohl niemand angesagt hatte. */
  var entwurf = {};   // {pid: {bid, made, angesagt}} für die laufende Runde
  /* Welche Runde gerade aufgedeckt wurde — die Zeile blitzt einmal auf, damit
     das Aufdecken ein Moment ist und nicht bloß ein stiller Tabellenwechsel. */
  var aufgedeckt = null;

  function wizard(c, affen) {
    var sitzung = aktuelle(c, 'wizard');
    if (!sitzung) return leer('Block der Wahrheit', 'Noch keine Sitzung. Noch nichts gelogen.', function () { neueSitzung('wizard', affen); });

    var spieler = (sitzung.players || []).map(function (pid) {
      return affen.filter(function (a) { return a.id === pid; })[0];
    }).filter(Boolean);
    if (!spieler.length) spieler = affen.slice(0, 6);

    var rundenGesamt = sitzung.rundenGesamt || SA.wizardRunden(spieler.length) || 10;
    var modus = sitzung.ansageModus === 'verdeckt' ? 'verdeckt' : 'offen';
    var aktiv = sitzung.aktiveRunde || 1;
    var gespielt = sitzung.runden || [];

    // Summen und Wahrheitsquote aus den abgeschlossenen Runden
    var totals = {}, treffer = {}, versuche = {};
    spieler.forEach(function (p) { totals[p.id] = 0; treffer[p.id] = 0; versuche[p.id] = 0; });
    gespielt.forEach(function (r) {
      spieler.forEach(function (p) {
        var cell = (r.cells || {})[p.id];
        if (!cell || cell.bid == null) return;
        totals[p.id] += cell.points || 0;
        versuche[p.id] += 1;
        if (cell.bid === cell.made) treffer[p.id] += 1;
      });
    });

    var rows = [];
    for (var n = 1; n <= rundenGesamt; n++) {
      var vorhanden = gespielt.filter(function (r) { return r.n === n; })[0];
      rows.push(vorhanden || { n: n, cards: n, cells: {} });
    }

    /* Eingabe der laufenden Runde. Vorher standen hier zwei nackte Zahlenfelder
       mit den Kürzeln G und M — man musste wissen, was gemeint ist, und traf sie
       am Tisch schlecht. Jetzt: je ein Zähler mit −/+ und ausgeschriebener
       Beschriftung, dazu unten eine Zeile, die mitzählt, wie viele Stiche noch
       zu verteilen sind. */
    function wert(p, key) {
      if (!entwurf[p.id]) entwurf[p.id] = { bid: 0, made: 0, angesagt: false };
      return entwurf[p.id][key];
    }
    function summe(key) {
      return spieler.reduce(function (s, p) { return s + wert(p, key); }, 0);
    }
    /* Offen gilt die Ansage sofort — man sieht sie ja. Verdeckt erst, wenn der
       Affe sie im Dialog bestätigt hat. */
    function angesagt(p) { return modus === 'offen' || !!wert(p, 'angesagt'); }
    function alleAngesagt() { return spieler.every(angesagt); }

    var statusHost = h('div.sa-pad__status');
    var abschliessen = U.Button({
      children: 'Runde abschließen', size: 'sm', variant: 'live', iconLeft: 'check',
      onClick: function () { rundeAbschliessen(); }
    });

    function zeichneStatus() {
      var offen = aktiv - summe('made');
      var fehlendeAnsagen = spieler.filter(function (p) { return !angesagt(p); }).length;
      // Zwei Bedingungen: alle haben angesagt, und die Stiche gehen auf. Sonst
      // ist die Runde nicht wertbar — der Knopf bleibt zu, die Zeile sagt warum.
      abschliessen.disabled = offen !== 0 || fehlendeAnsagen > 0;
      window.SA_DOM.mount(statusHost,
        fehlendeAnsagen
          ? h('span.sa-pad__stiche', (fehlendeAnsagen === 1 ? 'Es fehlt noch ' : 'Es fehlen noch ') +
              SA.plural(fehlendeAnsagen, 'Ansage', 'Ansagen') + '.')
          : h('span', { class: ['sa-pad__stiche', offen === 0 ? 'is-ok' : offen < 0 ? 'is-zuviel' : null] },
              offen === 0 ? 'Alle ' + SA.plural(aktiv, 'Stich', 'Stiche') + ' verteilt.'
                : offen > 0 ? 'Noch ' + SA.plural(offen, 'Stich', 'Stiche') + ' zu verteilen.'
                : SA.plural(-offen, 'Stich', 'Stiche') + ' zu viel — so viele gibt es nicht.'),
        modus === 'verdeckt'
          ? h('span.sa-meta', 'Verdeckt: die Ansagen stehen erst am Rundenende in der Tabelle.')
          : h('span.sa-meta', 'Angesagt zusammen: ' + summe('bid') +
              (summe('bid') === aktiv ? ' — geht genau auf. Einer lügt.' : ''))
      );
    }

    /* Zähler mit −/+ für einen Wert der laufenden Runde. */
    function zaehler(p, key, lang, aufAenderung) {
      var zahl = h('span.sa-step__wert', String(wert(p, key)));
      function setze(delta) {
        var v = Math.max(0, Math.min(aktiv, wert(p, key) + delta));
        entwurf[p.id][key] = v;
        zahl.textContent = String(v);
        if (aufAenderung) aufAenderung(v);
        zeichneStatus();
      }
      return h('span.sa-step__ctrl', null,
        U.IconButton({ icon: 'minus', label: p.name + ': ' + lang + ' weniger', variant: 'outline', size: 'sm', onClick: function () { setze(-1); } }),
        zahl,
        U.IconButton({ icon: 'plus', label: p.name + ': ' + lang + ' mehr', variant: 'outline', size: 'sm', onClick: function () { setze(1); } }));
    }

    /* Verdeckte Ansage: das Gerät wandert einmal um den Tisch. Der Wert steht
       nur in diesem Dialog; in der Tabelle bleibt bis zur Wertung ein „Steht".
       Er wird bewusst nicht ins Dokument geschrieben — was dort landet, kann
       jeder über die öffentliche Schnittstelle lesen. Ein Neuladen kostet also
       die Ansagen der laufenden Runde. */
    function ansageDialog(p, aufFertig) {
      var stand = wert(p, 'bid');
      SH.overlay(function (close) {
        var zahl = h('span.sa-ansage__zahl', String(stand));
        function setze(delta) {
          stand = Math.max(0, Math.min(aktiv, stand + delta));
          zahl.textContent = String(stand);
        }
        return U.Dialog({
          tone: 'neon', width: 420, onClose: close,
          eyebrow: 'Runde ' + aktiv + ' · verdeckt',
          title: p.name + ', wie viele?',
          children: [
            h('span.sa-body', 'Nur du siehst das. In der Tabelle steht danach bloß, dass du angesagt hast.'),
            h('div.sa-ansage', null,
              U.IconButton({ icon: 'minus', label: 'Weniger', variant: 'outline', size: 'lg', onClick: function () { setze(-1); } }),
              zahl,
              U.IconButton({ icon: 'plus', label: 'Mehr', variant: 'outline', size: 'lg', onClick: function () { setze(1); } })),
            h('span.sa-meta', 'Zwischen 0 und ' + aktiv + '. Danach das Gerät weitergeben.')
          ],
          footer: [
            U.Button({ children: 'Abbrechen', variant: 'ghost', onClick: close }),
            U.Button({
              children: 'Merken', iconLeft: 'lock',
              onClick: function () {
                entwurf[p.id].bid = stand;
                entwurf[p.id].angesagt = true;
                close();
                if (aufFertig) aufFertig();
                zeichneStatus();
              }
            })
          ]
        });
      });
    }

    function stepper(p) {
      var ansageHost = h('span.sa-step__ctrl');
      function zeichneAnsage() {
        if (modus === 'offen') {
          window.SA_DOM.mount(ansageHost, zaehler(p, 'bid', 'Ansage'));
          return;
        }
        var steht = wert(p, 'angesagt');
        window.SA_DOM.mount(ansageHost, U.Button({
          children: steht ? 'Steht' : 'Ansagen',
          size: 'sm', variant: steht ? 'secondary' : 'primary',
          iconLeft: steht ? 'lock' : 'pencil',
          onClick: function () { ansageDialog(p, zeichneAnsage); }
        }));
      }
      zeichneAnsage();

      return h('span.sa-step__paar', null,
        h('span.sa-step', null, h('span.sa-step__label', 'Ansage'), ansageHost),
        h('span.sa-step', null, h('span.sa-step__label', 'Geholt'), zaehler(p, 'made', 'Geholte Stiche')));
    }

    /* Beim Wechsel werden die Ansagen der laufenden Runde zurückgesetzt: von
       offen auf verdeckt haben alle die Zahlen ohnehin schon gesehen, und
       andersherum wäre die stille Enthüllung eine Überraschung. */
    function modusWechseln(neuerModus) {
      if (neuerModus === modus) return;
      entwurf = {};        // aus demselben Grund vor dem Speichern, nicht danach
      aufgedeckt = null;
      S.update(function (doc) {
        var s = letzteSitzung(doc, 'wizard');
        if (!s) return false;
        s.ansageModus = neuerModus;
      }, {
        summary: 'Wizard-Ansagen jetzt ' + neuerModus,
        entries: [{ icon: neuerModus === 'verdeckt' ? 'lock' : 'lock-open', tone: 'neutral',
          text: 'Ansagen im Block der Wahrheit jetzt ' + neuerModus + '.', from: modus, to: neuerModus }]
      }).then(function () {
        S.toast(neuerModus === 'verdeckt' ? 'Verdeckt' : 'Offen',
          neuerModus === 'verdeckt'
            ? 'Jeder sagt für sich an. Gerät weitergeben, nicht schielen.'
            : 'Ansagen wieder für alle sichtbar. Die laufende Runde fängt von vorn an.',
          'neutral');
      }).catch(function () { /* Meldung kam schon vom Store */ });
    }

    function rundeAbschliessen() {
      if (!alleAngesagt()) {
        S.toast('Erst ansagen', 'Es fehlen noch Ansagen. Gerät weitergeben.', 'punsch');
        return;
      }
      var summe = spieler.reduce(function (s, p) { return s + ((entwurf[p.id] || {}).made || 0); }, 0);
      if (summe !== aktiv) {
        S.toast('Zahlen, bitte.', 'In Runde ' + aktiv + ' gibt es genau ' + aktiv + ' Stiche, gezählt wurden ' + summe + '.', 'punsch');
        return;
      }
      var cells = {};
      spieler.forEach(function (p) {
        var d = entwurf[p.id] || { bid: 0, made: 0 };
        cells[p.id] = { bid: d.bid, made: d.made, points: SA.wizardPunkte(d.bid, d.made) };
      });
      var luegner = spieler.filter(function (p) { return cells[p.id].bid !== cells[p.id].made; });

      /* Vor dem Speichern leeren, nicht danach: der Speicher zeichnet neu,
         sobald die Runde steht. Käme das Zurücksetzen erst im .then, liefe die
         nächste Runde mit den Ansagen der vorigen weiter. */
      entwurf = {};
      aufgedeckt = modus === 'verdeckt' ? aktiv : null;

      S.update(function (doc) {
        var s = letzteSitzung(doc, 'wizard');
        if (!s) return false;
        s.runden = (s.runden || []).filter(function (r) { return r.n !== aktiv; }).concat([{ n: aktiv, cards: aktiv, cells: cells }]);
        s.runden.sort(function (a, b) { return a.n - b.n; });
        s.aktiveRunde = Math.min(rundenGesamt, aktiv + 1);
      }, { summary: 'Wizard-Runde ' + aktiv + ' gewertet' }).then(function () {
        S.toast(modus === 'verdeckt' ? 'Aufgedeckt' : 'Runde ' + aktiv + ' steht', luegner.length
          ? luegner.map(function (p) { return p.name; }).join(' & ') + ' lag daneben. Wie angekündigt.'
          : 'Alle richtig. Verdächtig.', luegner.length ? 'punsch' : 'slime');
      }).catch(function () { /* Meldung kam schon vom Store */ });
    }

    zeichneStatus();

    var quoten = spieler.map(function (p) {
      return { p: p, quote: versuche[p.id] ? treffer[p.id] / versuche[p.id] : null, treffer: treffer[p.id], versuche: versuche[p.id] };
    }).sort(function (a, b) { return (b.quote || 0) - (a.quote || 0); });
    var bester = quoten[0];
    var luegner = quoten[quoten.length - 1];

    return h('div.sa-cols.sa-cols--side', null,
      U.Card({
        padding: '0',
        children: [
          h('div.sa-card__head', null,
            h('div.sa-card__heading', null,
              h('span.sa-card__eyebrow', 'Wizard · Sitzung vom ' + SA.fmtDate(sitzung.date)),
              h('h3.sa-card__title', 'Block der Wahrheit')),
            h('div.sa-inline', null,
              U.Badge({ children: 'Runde ' + aktiv + ' / ' + rundenGesamt, tone: 'punsch', dot: true }),
              U.Tabs({
                variant: 'pill', value: modus,
                items: [{ id: 'offen', label: 'Offen' }, { id: 'verdeckt', label: 'Verdeckt' }],
                onChange: function (id) { modusWechseln(id); }
              }),
              abschliessen)),
          h('div.sa-scrollx', null, U.ScorePad({
            players: spieler, rounds: rows, totals: totals, activeRound: aktiv,
            revealRound: aufgedeckt, renderActiveCell: stepper,
            // Die Zähler brauchen mehr Platz als die fertigen Zellen.
            style: { '--sa-pad-cols': '64px repeat(' + spieler.length + ', minmax(112px, 1fr))' }
          })),
          statusHost,
          h('div', { style: { padding: '0 var(--pad-card) var(--space-5)' } },
            h('span.sa-meta', 'Ansage getroffen: 20 Punkte plus 10 je Stich. Daneben: 10 Minus je Stich Differenz. ' +
              rundenGesamt + ' Runden, weil ' + SA.plural(spieler.length, 'Affe', 'Affen') + ' sich 60 Karten teilen. ' +
              (modus === 'verdeckt'
                ? 'Verdeckt heißt: jeder sagt allein am Gerät an, sichtbar wird es erst bei der Wertung.'
                : 'Offen heißt: angesagt wird mit ±1 am Tisch, alle sehen alles.')))
        ]
      }),

      h('div.sa-stack', null,
        U.Card({
          padding: '0', title: 'Wahrheitsquote',
          children: quoten.map(function (q) {
            return h('div.sa-row', null,
              U.PlayerAvatar({ name: q.p.name, seat: q.p.seat, size: 'sm' }),
              h('span', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 } },
                h('span.sa-strong.sa-truncate', q.p.name),
                h('span.sa-meta', q.versuche ? q.treffer + ' von ' + q.versuche + ' Ansagen' : 'noch nichts gesagt')),
              h('span.sa-num', {
                style: { fontSize: '19px', color: q.quote == null ? 'var(--text-faint)' : q.quote >= 0.6 ? 'var(--slime-500)' : 'var(--punsch-400)' }
              }, q.quote == null ? '—' : Math.round(q.quote * 100) + '%'));
          })
        }),
        U.Card({
          tone: 'neon', eyebrow: 'Urteil', title: 'Wer lügt hier',
          children: U.Tease({
            tone: T.teaseWahrheit(bester && bester.p.name, bester && bester.quote).tone,
            children: (luegner && luegner.quote != null && luegner.quote <= 0.3)
              ? luegner.p.name + ' sagt an wie andere raten.'
              : T.teaseWahrheit(bester && bester.p.name, bester && bester.quote).text
          })
        }),
        U.Card({
          tone: 'sunken', eyebrow: 'Sitzung', title: 'Neu anfangen?',
          children: [
            h('span.sa-body', 'Die alte Sitzung bleibt stehen. Der Block vergisst nichts.'),
            U.Button({ children: 'Neue Sitzung', size: 'sm', variant: 'secondary', iconLeft: 'plus', onClick: function () { entwurf = {}; neueSitzung('wizard', affen); } })
          ]
        }))
    );
  }

  function letzteSitzung(doc, art) {
    var liste = ((doc.modules || {})[art] || {}).sessions || [];
    return liste[liste.length - 1] || null;
  }

  function leer(titel, text, onNeu) {
    return U.Card({
      padding: '0', tone: 'sunken',
      children: h('div.sa-empty', null,
        U.Icon('extension', { size: 32, color: 'var(--text-faint)' }),
        h('span.sa-empty__text', text),
        U.Button({ children: 'Sitzung starten', iconLeft: 'play', onClick: onNeu }))
    });
  }

  /* Die Module sind kein eigener Bildschirm mehr: sie sind das Werkzeug für
     eine laufende Partie und werden vom Abend-Screen eingesetzt. */
  window.SA_MODULE = {
    catan: catan,
    wizard: wizard,
    /* Aus der Wizard-Sitzung wird eine Partie: die Summen sind die Punktzahl,
       die Reihenfolge liest die Engine daraus. Bestätigt wird sie von Hand —
       der Block weiß, wie gespielt wurde, nicht ob ihr das so stehen lassen
       wollt. Getroffene Ansagen wandern als Statistik mit, nicht als Punkte. */
    wizardErgebnis: function (c, affen) {
      var sitzung = aktuelle(c, 'wizard');
      if (!sitzung || !(sitzung.runden || []).length) return null;
      var spieler = (sitzung.players || []).map(function (pid) {
        return affen.filter(function (a) { return a.id === pid; })[0];
      }).filter(Boolean);
      if (spieler.length < 2) return null;

      var punkte = {}, treffer = {};
      spieler.forEach(function (p) { punkte[p.id] = 0; treffer[p.id] = 0; });
      (sitzung.runden || []).forEach(function (r) {
        spieler.forEach(function (p) {
          var cell = (r.cells || {})[p.id];
          if (!cell || cell.bid == null) return;
          punkte[p.id] += cell.points || 0;
          if (cell.bid === cell.made) treffer[p.id] += 1;
        });
      });
      return {
        sitzung: sitzung,
        runden: (sitzung.runden || []).length,
        rundenGesamt: sitzung.rundenGesamt || SA.wizardRunden(spieler.length),
        results: spieler.map(function (p) {
          return { playerId: p.id, score: punkte[p.id], treffer: treffer[p.id] };
        })
      };
    }
  };
})();
