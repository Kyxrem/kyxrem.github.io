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
  var h = window.h, U = window.SA_UI, SA = window.SA, S = window.SA_STORE, T = window.SA_TEASE;

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
            runden: [], aktiveRunde: 1, rundenGesamt: 10
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
  /* Wertung: Ansage getroffen = 20 + 10 je Stich. Daneben = −10 je Stich Differenz. */
  function wizardPunkte(bid, made) {
    return bid === made ? 20 + 10 * made : -10 * Math.abs(bid - made);
  }

  var entwurf = {};   // {pid: {bid, made}} für die laufende Runde

  function wizard(c, affen) {
    var sitzung = aktuelle(c, 'wizard');
    if (!sitzung) return leer('Block der Wahrheit', 'Noch keine Sitzung. Noch nichts gelogen.', function () { neueSitzung('wizard', affen); });

    var spieler = (sitzung.players || []).map(function (pid) {
      return affen.filter(function (a) { return a.id === pid; })[0];
    }).filter(Boolean);
    if (!spieler.length) spieler = affen.slice(0, 6);

    var rundenGesamt = sitzung.rundenGesamt || 10;
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

    function stepper(p) {
      if (!entwurf[p.id]) entwurf[p.id] = { bid: 0, made: 0 };
      var d = entwurf[p.id];
      function feld(key, label) {
        var input = h('input', {
          value: String(d[key]), inputMode: 'numeric', 'aria-label': p.name + ' ' + label,
          oninput: function (e) { d[key] = Math.max(0, Math.min(aktiv, Number(e.target.value.replace(/[^0-9]/g, '')) || 0)); }
        });
        return h('span.sa-pad__stepper', null, h('span.sa-meta', label), input);
      }
      return h('span', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' } },
        feld('bid', 'G'), feld('made', 'M'));
    }

    function rundeAbschliessen() {
      var summe = spieler.reduce(function (s, p) { return s + ((entwurf[p.id] || {}).made || 0); }, 0);
      if (summe !== aktiv) {
        S.toast('Zahlen, bitte.', 'In Runde ' + aktiv + ' gibt es genau ' + aktiv + ' Stiche, gezählt wurden ' + summe + '.', 'punsch');
        return;
      }
      var cells = {};
      spieler.forEach(function (p) {
        var d = entwurf[p.id] || { bid: 0, made: 0 };
        cells[p.id] = { bid: d.bid, made: d.made, points: wizardPunkte(d.bid, d.made) };
      });
      var luegner = spieler.filter(function (p) { return cells[p.id].bid !== cells[p.id].made; });

      S.update(function (doc) {
        var s = letzteSitzung(doc, 'wizard');
        if (!s) return false;
        s.runden = (s.runden || []).filter(function (r) { return r.n !== aktiv; }).concat([{ n: aktiv, cards: aktiv, cells: cells }]);
        s.runden.sort(function (a, b) { return a.n - b.n; });
        s.aktiveRunde = Math.min(rundenGesamt, aktiv + 1);
      }, { summary: 'Wizard-Runde ' + aktiv + ' gewertet' }).then(function () {
        entwurf = {};
        S.toast('Runde ' + aktiv + ' steht', luegner.length
          ? luegner.map(function (p) { return p.name; }).join(' & ') + ' lag daneben. Wie angekündigt.'
          : 'Alle richtig. Verdächtig.', luegner.length ? 'punsch' : 'slime');
      }).catch(function () { /* Meldung kam schon vom Store */ });
    }

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
              U.Button({ children: 'Runde abschließen', size: 'sm', variant: 'live', iconLeft: 'check', onClick: rundeAbschliessen }))),
          h('div.sa-scrollx', null, U.ScorePad({
            players: spieler, rounds: rows, totals: totals, activeRound: aktiv,
            renderActiveCell: stepper
          })),
          h('div', { style: { padding: 'var(--space-5) var(--pad-card)' } },
            h('span.sa-meta', 'G = gesagt, M = gemacht. Treffer bringt 20 + 10 je Stich, daneben kostet 10 je Stich Differenz.'))
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

  window.SA_SCREENS = window.SA_SCREENS || {};
  window.SA_SCREENS.module = function (state, c) {
    var SH = window.SA_SHELL;
    var affen = S.affen('all', { includeEmpty: true });

    return [
      SH.ScreenHead({
        eyebrow: 'Spielmodule',
        title: modul === 'catan' ? 'Würfelstatistik' : 'Block der Wahrheit',
        sub: modul === 'catan'
          ? 'Was gefallen ist, gegen das, was fallen müsste. Ausreden werden geprüft.'
          : 'Gesagt gegen gemacht. Zehn Runden, eine Quote, keine Gnade.',
        actions: U.Tabs({
          variant: 'pill', value: modul,
          items: [{ id: 'catan', label: 'Catan' }, { id: 'wizard', label: 'Wizard' }],
          onChange: function (id) { modul = id; S.emit(); }
        })
      }),
      modul === 'catan' ? catan(c, affen) : wizard(c, affen)
    ];
  };

  /* Aus dem Spiele-Regal heraus direkt ins passende Modul springen. */
  window.SA_SCREENS.module.oeffne = function (art) {
    modul = art === 'wizard' ? 'wizard' : 'catan';
    S.navigate('module');
  };
})();
