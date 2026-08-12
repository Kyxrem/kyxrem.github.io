/* SpieleAffen — Abend.
 *
 * Der Startbildschirm und der Kern der App: ein Abend wird gestartet, es
 * werden Partien gespielt, ein Knopf beendet ihn, danach steht die Auswertung.
 *
 * Punkte kommen einzig aus den Plätzen (4/3/2/1, ab dem fünften nichts). Die
 * Reihenfolge ergibt sich aus der Punktzahl, die ihr je Partie eintragt —
 * bei Wizard schlägt der Block der Wahrheit sie selbst vor.
 *
 * Punsch ist hier erlaubt: es läuft ja wirklich etwas.
 */
(function () {
  'use strict';
  var h = window.h, U = window.SA_UI, SA = window.SA, S = window.SA_STORE, T = window.SA_TEASE, SH = window.SA_SHELL;

  /* Welches Werkzeug gerade offen ist: null (nur der Abend), 'wizard' oder
     'catan'. Lebt außerhalb der Zeichenfunktion, damit ein Neuzeichnen es
     nicht zuklappt. */
  var werkzeug = null;

  // ── Kennzahlen ───────────────────────────────────────────────────────────
  function kennzahlen(c, affen, me) {
    var ich = me ? affen.filter(function (a) { return a.id === me.id; })[0] : null;
    var abende = c.playedNights.length;
    var imMonat = c.playedNights.filter(function (n) { return SA.monthKey(n.date) === SA.monthKey(S.heute()); }).length;
    var beste = affen.slice().sort(function (a, b) { return b.bestStreak - a.bestStreak; })[0];
    var partien = c.playedNights.reduce(function (s, n) { return s + (n.games || []).length; }, 0);

    return [
      U.StatTile({
        label: 'Abende gespielt', value: abende, icon: 'calendar-days',
        delta: imMonat ? '+' + imMonat + ' diesen Monat' : null
      }),
      U.StatTile({
        label: ich ? 'Deine Abendsiege' : 'Abendsiege', tone: 'slime', icon: 'trophy',
        value: ich ? ich.wins : affen.reduce(function (s, a) { return s + a.wins; }, 0),
        unit: ich ? '/ ' + ich.nights : null
      }),
      U.StatTile({
        label: 'Längste Serie', tone: 'banana', icon: 'flame',
        value: beste ? beste.bestStreak : 0, unit: beste && beste.bestStreak === 1 ? 'Abend' : 'Abende',
        delta: beste && beste.bestStreak ? beste.name + ', natürlich' : null
      }),
      U.StatTile({
        label: 'Partien gespielt', icon: 'dices', value: partien,
        delta: abende ? Math.round((partien / abende) * 10) / 10 + ' je Abend' : null
      })
    ];
  }

  // ── Laufender Abend: Stand ───────────────────────────────────────────────
  /* Die Tabelle des Abends. Punkte kommen aus den Plätzen der Partien; hier
     wird nichts addiert, was die Engine nicht schon gerechnet hat. */
  function standHeute(c, live, ev) {
    var dabei = (live.dabei || []).map(function (pid) { return c.playerById[pid]; }).filter(Boolean);
    var zeilen = dabei.map(function (p) {
      var e = ev.per[p.id];
      return { p: p, punkte: e ? e.total : 0, partien: e ? e.games.length : 0, platz: e ? e.place : dabei.length };
    }).sort(function (a, b) { return b.punkte - a.punkte; });
    var fuehrt = zeilen[0];

    return U.Card({
      padding: '0',
      children: [
        h('div.sa-card__head', null,
          h('div.sa-card__heading', null,
            h('h3.sa-h3', 'Stand heute'),
            h('span.sa-meta', (live.games || []).length
              ? SA.plural((live.games || []).length, 'Partie', 'Partien') + ' gespielt'
              : 'Noch keine Partie eingetragen')),
          U.Badge({ children: 'live', tone: 'punsch', dot: true })),
        zeilen.map(function (z, i) {
          return h('div.sa-row', { style: z.p.id === (S.get().me || {}).id ? { background: 'var(--slime-900)' } : null },
            h('span.sa-num', { style: { width: '22px', textAlign: 'right', fontSize: '15px', color: 'var(--text-faint)' } },
              String(i + 1)),
            U.PlayerAvatar({ name: z.p.name, seat: z.p.seat, crown: fuehrt && z.p.id === fuehrt.p.id && z.punkte > 0 }),
            h('span', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 } },
              h('span.sa-strong.sa-truncate', z.p.name),
              h('span.sa-meta', z.partien ? SA.plural(z.partien, 'Partie', 'Partien') : 'noch nichts gespielt')),
            h('span.sa-num', {
              style: {
                fontSize: '23px', minWidth: '56px', textAlign: 'right',
                color: fuehrt && z.p.id === fuehrt.p.id && z.punkte > 0 ? 'var(--slime-500)' : 'var(--text-strong)'
              }
            }, U.num(z.punkte)));
        })
      ]
    });
  }

  /* Eine Karte je gespielter Partie: die Reihenfolge, wie sie die App aus den
     Punktzahlen gelesen hat, und was sie an Siegpunkten wert war. */
  function partie(c, live, spiel, nr) {
    var ev = SA.evalGame(spiel);
    var zeilen = (spiel.results || []).slice().sort(function (a, b) {
      return (ev[a.playerId] || {}).place - (ev[b.playerId] || {}).place;
    });

    return U.Card({
      padding: '0',
      children: [
        h('div.sa-card__head', null,
          h('div.sa-card__heading', null,
            h('h3.sa-h3', spiel.title),
            h('span.sa-meta', 'Partie ' + nr + (spiel.lowerWins ? ' · weniger gewinnt' : ''))),
          U.IconButton({
            icon: 'trash', label: spiel.title + ' aus dem Abend nehmen', variant: 'ghost', size: 'sm',
            onClick: function () { partieLoeschen(live, spiel); }
          })),
        zeilen.map(function (r) {
          var e = ev[r.playerId] || {};
          var p = c.playerById[r.playerId] || { name: r.playerId, seat: 1 };
          return h('div.sa-row', null,
            h('span.sa-num', { style: { width: '22px', textAlign: 'right', fontSize: '15px', color: 'var(--text-faint)' } },
              e.place + '.'),
            U.PlayerAvatar({ name: p.name, seat: p.seat, size: 'sm', crown: e.place === 1 }),
            h('span.sa-strong.sa-truncate', { style: { flex: 1, minWidth: 0 } },
              p.name + (e.geteilt > 1 ? ' · geteilt' : '')),
            h('span.sa-meta.sa-meta--mono', { style: { width: '64px', textAlign: 'right' } }, U.num(r.score)),
            h('span.sa-num', {
              style: { width: '48px', textAlign: 'right', fontSize: '17px', color: e.placePts ? 'var(--slime-500)' : 'var(--text-faint)' }
            }, '+' + U.num(e.placePts)));
        })
      ]
    });
  }

  function partieLoeschen(live, spiel) {
    S.update(function (doc) {
      var n = doc.nights.filter(function (x) { return x.id === live.id; })[0];
      if (!n) return false;
      n.games = (n.games || []).filter(function (g) { return g.id !== spiel.id; });
    }, {
      summary: spiel.title + ' aus dem Abend genommen',
      entries: [{ icon: 'trash', tone: 'punsch', text: spiel.title + ' aus dem laufenden Abend genommen.' }]
    }).then(function () {
      S.toast('Weg', spiel.title + ' zählt nicht mehr. Als wäre nichts gewesen.', 'punsch');
    }).catch(function () { /* Meldung kam schon vom Store */ });
  }

  // ── Auswertung ───────────────────────────────────────────────────────────
  /* Nach dem Beenden: wer hat den Abend geholt, wie stand es, und was macht
     das mit der Gesamttabelle. Die Veränderung ist der eigentliche Punkt —
     ein Abendsieg, der niemanden überholt, fühlt sich anders an. */
  function auswertung(c, abend) {
    var info = c.nightInfos.filter(function (i) { return i.night.id === abend.id; })[0];
    if (!info) return null;
    var ev = info.eval;
    var sieger = ev.winners.map(function (pid) { return c.playerById[pid]; }).filter(Boolean);
    var gesamt = S.affen('all');

    var zeilen = ev.players.map(function (pid) {
      var p = c.playerById[pid];
      var g = gesamt.filter(function (x) { return x.id === pid; })[0];
      return { p: p, e: ev.per[pid], platz: g ? g.place : null, gesamtPunkte: g ? g.points : 0 };
    }).filter(function (z) { return z.p; }).sort(function (a, b) { return a.e.place - b.e.place; });

    return U.Card({
      tone: 'neon', padding: '0',
      children: [
        h('div.sa-card__head', null,
          h('div.sa-card__heading', null,
            h('span.sa-eyebrow', 'Auswertung · ' + SA.fmtDateLong(abend.date)),
            h('h3.sa-h3', sieger.length
              ? sieger.map(function (p) { return p.name; }).join(' & ') + ' hat den Abend geholt'
              : 'Abend beendet')),
          U.Badge({ children: SA.plural((abend.games || []).length, 'Partie', 'Partien'), tone: 'slime', size: 'sm' })),
        h('div.sa-thead', { style: { gridTemplateColumns: '28px 1fr 72px 88px' } },
          h('span', ''), h('span', 'Affe'), h('span', 'Abend'), h('span', 'Gesamt')),
        zeilen.map(function (z) {
          return h('div.sa-trow', { style: { gridTemplateColumns: '28px 1fr 72px 88px' } },
            h('span.sa-num', { style: { fontSize: '15px', color: 'var(--text-faint)' } }, z.e.place + '.'),
            h('span.sa-inline', { style: { flexWrap: 'nowrap', minWidth: 0 } },
              U.PlayerAvatar({ name: z.p.name, seat: z.p.seat, size: 'sm', crown: z.e.place === 1 }),
              h('span.sa-strong.sa-truncate', z.p.name)),
            h('span.sa-num', { style: { fontSize: '17px', textAlign: 'right', color: z.e.place === 1 ? 'var(--slime-500)' : null } },
              U.num(z.e.total)),
            h('span', { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1px' } },
              h('span.sa-num', { style: { fontSize: '15px' } }, U.num(z.gesamtPunkte)),
              h('span.sa-meta', z.platz ? 'Platz ' + z.platz : '')));
        }),
        h('div', { style: { padding: 'var(--space-5) var(--pad-card)' } },
          h('span.sa-meta', 'Die Punkte stehen jetzt in der Gesamttabelle. Korrigieren geht nur noch im Admin — und steht dort im Log.'))
      ]
    });
  }

  // ── Letzte Abende ────────────────────────────────────────────────────────
  function letzteAbende(c) {
    var abende = c.nightInfos.slice(-6).reverse();
    return U.Card({
      padding: '0', title: 'Letzte Abende',
      children: abende.length ? abende.map(function (info) {
        var sieger = info.eval.winners.map(function (pid) { return c.playerById[pid]; }).filter(Boolean)[0];
        var titel = (info.night.games || []).map(function (g) { return g.title; }).join(' · ');
        return h('div.sa-row', null,
          h('span.sa-meta.sa-meta--mono', { style: { width: '84px', flex: '0 0 auto' } }, SA.fmtDateLong(info.night.date)),
          h('span', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 } },
            h('span.sa-strong.sa-truncate', titel || info.night.title),
            U.Tease({ tone: 'brag', size: 'sm', icon: null, children: (sieger ? sieger.name : 'Niemand') + ' hat’s genommen.' })),
          sieger ? U.Tag({ children: sieger.name, color: U.seatVar(sieger.seat), size: 'sm' }) : null,
          h('span.sa-num', { style: { width: '44px', textAlign: 'right', fontSize: '16px' } },
            U.num(sieger ? info.eval.per[sieger.id].total : 0)));
      }) : h('div.sa-empty', null,
        U.Icon('calendar-days', { size: 32, color: 'var(--text-faint)' }),
        h('span.sa-empty__text', 'Noch kein Abend gespielt. Sehr mutig.'))
    });
  }

  // ── Screen ───────────────────────────────────────────────────────────────
  window.SA_SCREENS = window.SA_SCREENS || {};
  window.SA_SCREENS.abend = function (state, c) {
    var SH = window.SA_SHELL;
    var live = c.liveNight;
    var affen = S.affen('all');

    // ── Es läuft nichts ─────────────────────────────────────────────────────
    if (!live) {
      var letzter = c.playedNights.length ? c.playedNights[c.playedNights.length - 1] : null;
      var geplant = c.nextNight;
      return [
        SH.ScreenHead({
          eyebrow: SA.fmtDateLong(S.heute()),
          title: 'Nichts läuft',
          sub: affen.length
            ? SA.plural(affen.length, 'Affe', 'Affen') + ' im Block, ' + SA.plural(c.shelf.length, 'Spiel', 'Spiele') + ' im Regal.'
            : 'Noch keine Affen. Erst anlegen, dann verlieren.',
          actions: U.Button({
            children: 'Abend starten', iconLeft: 'play',
            onClick: function () { window.SA_DIALOGS.abendStarten(geplant); }
          })
        }),
        h('div.sa-stats', kennzahlen(c, affen, state.me)),
        letzter ? h('div.sa-section-gap', null, auswertung(c, letzter)) : null,
        h('div.sa-cols.sa-cols--wide', null,
          letzteAbende(c),
          U.Card({
            tone: 'sunken', eyebrow: geplant ? 'Geplant' : 'So läuft es',
            title: geplant ? geplant.title : 'Abend, Partien, Auswertung',
            children: [
              h('span.sa-body', geplant
                ? SA.fmtDateLong(geplant.date) + (geplant.zeit ? ', ' + geplant.zeit : '') + ' · ' +
                  SA.plural((geplant.dabei || []).length, 'Affe', 'Affen') + ' zugesagt.'
                : 'Abend starten, wer dabei ist auswählen. Dann Partie für Partie eintragen — die Plätze rechnet die App. Am Ende „Abend beenden", und die Auswertung steht.'),
              h('span.sa-meta', 'Platz 1 bis 4 bringen 4/3/2/1 Punkte, ab dem fünften nichts. Wer sich einen Platz teilt, teilt auch die Punkte.')
            ]
          }))
      ];
    }

    // ── Es läuft ────────────────────────────────────────────────────────────
    var ev = SA.evalNight(live);
    var partien = (live.games || []).slice().reverse();
    var dabeiAffen = S.affen('all', { includeEmpty: true })
      .filter(function (a) { return (live.dabei || []).indexOf(a.id) >= 0; });
    var reiter = werkzeugReiter(c, live);

    return [
      SH.ScreenHead({
        eyebrow: 'Läuft seit ' + (live.startedAt || '—'),
        title: live.title || 'Spieleabend',
        sub: SA.plural((live.dabei || []).length, 'Affe', 'Affen') + ' am Tisch · ' +
          (partien.length ? SA.plural(partien.length, 'Partie', 'Partien') + ' im Kasten' : 'noch keine Partie'),
        actions: [
          U.Button({
            children: 'Partie eintragen', iconLeft: 'dices',
            onClick: function () { window.SA_DIALOGS.ergebnisEintragen({ abendId: live.id }); }
          }),
          U.Button({
            children: 'Abend beenden', variant: 'secondary', iconLeft: 'flag',
            onClick: function () { window.SA_DIALOGS.abendBeenden(live); }
          })
        ]
      }),
      reiter,
      werkzeug === 'wizard'
        ? h('div.sa-stack', null,
            U.Card({
              tone: 'sunken', eyebrow: 'Aus dem Block', title: 'Reihenfolge übernehmen',
              children: [
                h('span.sa-body', 'Wenn ihr fertig gespielt habt: der Block rechnet die Reihenfolge aus den Summen und legt sie dir vor.'),
                U.Button({
                  children: 'Ergebnis vorlegen', iconLeft: 'check', size: 'sm',
                  onClick: function () { wizardUebernehmen(c, live, dabeiAffen); }
                })
              ]
            }),
            window.SA_MODULE.wizard(c, dabeiAffen))
        : null,
      werkzeug === 'catan' ? window.SA_MODULE.catan(c, dabeiAffen) : null,
      werkzeug ? null : h('div.sa-cols.sa-cols--wide', null,
        h('div.sa-stack', null,
          standHeute(c, live, ev),
          partien.length
            ? partien.map(function (g, i) { return partie(c, live, g, partien.length - i); })
            : U.Card({
                tone: 'sunken', padding: '0',
                children: h('div.sa-empty', null,
                  U.Icon('dices', { size: 32, color: 'var(--text-faint)' }),
                  h('span.sa-empty__text', 'Noch nichts gespielt. Erste Partie eintragen, dann füllt sich das hier.'))
              })),
        h('div.sa-stack', null,
          U.Card({
            tone: 'neon', eyebrow: 'Urteil', title: 'Zwischenstand',
            children: U.Tease(zwischenspruch(c, ev))
          }),
          U.Card({
            tone: 'sunken', eyebrow: 'Wie es zählt', title: 'Die Rechnung',
            children: h('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' } },
              [['Platz 1 / 2 / 3 / 4', '4 / 3 / 2 / 1'], ['Ab Platz 5', '0'], ['Geteilter Platz', 'Topf durch Köpfe']]
                .map(function (z) {
                  return h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: 'var(--space-5)' } },
                    h('span.sa-body', z[0]), h('span.sa-num', { style: { fontSize: '14px' } }, z[1]));
                }))
          })))
    ];
  };

  // ── Werkzeug einer Partie ────────────────────────────────────────────────
  /* Catan und Wizard bringen eigenes Werkzeug mit. Es ist kein eigener
     Bildschirm mehr, sondern gehört zum laufenden Abend — und der Wizard-Block
     schlägt am Ende die Reihenfolge selbst vor. */
  function werkzeugReiter(c, live) {
    var module = c.shelf.filter(function (g) { return g.modul === 'wizard' || g.modul === 'catan'; });
    if (!module.length) return null;
    var items = [{ id: 'abend', label: 'Abend' }].concat(module.map(function (g) {
      return { id: g.modul, label: g.title };
    }));
    return U.Tabs({
      variant: 'pill', value: werkzeug || 'abend',
      items: items,
      onChange: function (id) { werkzeug = id === 'abend' ? null : id; S.emit(); }
    });
  }

  /* Aus der Wizard-Sitzung eine Partie machen. Die Reihenfolge kommt aus den
     Summen; bestätigt wird sie von Hand, weil der Block nicht weiß, ob ihr
     mittendrin abgebrochen habt. */
  function wizardUebernehmen(c, live, affen) {
    var erg = window.SA_MODULE.wizardErgebnis(c, affen);
    if (!erg) {
      S.toast('Nichts zu übernehmen', 'Erst eine Runde werten, dann steht ein Ergebnis da.', 'punsch');
      return;
    }
    var spiel = c.shelf.filter(function (g) { return g.modul === 'wizard'; })[0];
    var vorschlag = {
      id: SA.uid('g'), gameId: spiel ? spiel.id : null, title: spiel ? spiel.title : 'Wizard',
      lowerWins: false, results: erg.results
    };
    var ev = SA.evalGame(vorschlag);
    var zeilen = erg.results.slice().sort(function (a, b) { return ev[a.playerId].place - ev[b.playerId].place; });

    SH.overlay(function (close) {
      return U.Dialog({
        tone: 'neon', width: 520, eyebrow: 'Wizard · ' + erg.runden + ' von ' + erg.rundenGesamt + ' Runden',
        title: 'Steht die Reihenfolge so?', onClose: close,
        children: [
          h('span.sa-body', 'Der Block hat mitgerechnet. Bestätigt wird von Hand — danach zählt die Partie für den Abend.'),
          h('div.sa-card.sa-card--flush', null,
            h('div.sa-thead', { style: { gridTemplateColumns: '28px 1fr 72px 56px 52px' } },
              h('span', ''), h('span', 'Affe'), h('span', 'Wizard'), h('span', 'Getroffen'), h('span', 'Punkte')),
            zeilen.map(function (r) {
              var e = ev[r.playerId];
              var p = c.playerById[r.playerId] || { name: r.playerId, seat: 1 };
              return h('div.sa-trow', { style: { gridTemplateColumns: '28px 1fr 72px 56px 52px' } },
                h('span.sa-num', { style: { fontSize: '15px', color: 'var(--text-faint)' } }, e.place + '.'),
                h('span.sa-inline', { style: { flexWrap: 'nowrap', minWidth: 0 } },
                  U.PlayerAvatar({ name: p.name, seat: p.seat, size: 'sm', crown: e.place === 1 }),
                  h('span.sa-strong.sa-truncate', p.name)),
                h('span.sa-num.sa-meta--mono', { style: { textAlign: 'right' } }, U.num(r.score)),
                h('span.sa-num.sa-meta--mono', { style: { textAlign: 'right' } }, String(r.treffer)),
                h('span.sa-num', { style: { textAlign: 'right', color: e.placePts ? 'var(--slime-500)' : 'var(--text-faint)' } },
                  '+' + U.num(e.placePts)));
            })),
          h('span.sa-meta', 'Getroffene Ansagen zählen als Statistik, nicht als Punkte.')
        ],
        footer: [
          U.Button({ children: 'Noch nicht', variant: 'ghost', onClick: close }),
          U.Button({
            children: 'Als Partie übernehmen', iconLeft: 'check',
            onClick: function () {
              S.update(function (doc) {
                var n = doc.nights.filter(function (x) { return x.id === live.id; })[0];
                if (!n) return false;
                n.games = (n.games || []).concat([vorschlag]);
              }, {
                summary: 'Wizard-Ergebnis in den Abend übernommen',
                entries: [{
                  icon: 'extension', tone: 'banana',
                  text: 'Wizard aus dem Block übernommen. Sieger: ' +
                    ((c.playerById[zeilen[0].playerId] || {}).name || '—') + '.',
                  to: erg.runden + ' Runden'
                }]
              }).then(function () {
                close();
                werkzeug = null;
                S.toast('Übernommen', 'Die Partie steht im Abend. Der Block bleibt, wo er ist.', 'banana');
              }).catch(function () { /* Meldung kam schon vom Store */ });
            }
          })
        ]
      });
    });
  }

  /* Aus dem Regal heraus ins Werkzeug springen. Ohne laufenden Abend gibt es
     nichts zu werten — dann sagt die App das, statt ein leeres Brett zu zeigen. */
  window.SA_SCREENS.abend.werkzeugOeffnen = function (art) {
    if (!S.computed().liveNight) {
      S.toast('Kein Abend', 'Das Werkzeug gehört zu einer laufenden Partie. Erst den Abend starten.', 'punsch');
      S.navigate('abend');
      return;
    }
    werkzeug = art === 'wizard' ? 'wizard' : 'catan';
    S.navigate('abend');
  };

  /* Ein Satz zum Stand — der Vorsprung ist interessanter als die Zahl. */
  function zwischenspruch(c, ev) {
    var pids = ev.players;
    if (!pids.length) return { tone: 'burn', children: 'Noch keine Partie. Noch keine Ausreden.' };
    var sortiert = pids.slice().sort(function (a, b) { return ev.per[b].total - ev.per[a].total; });
    var erster = c.playerById[sortiert[0]];
    var zweiter = sortiert[1] ? c.playerById[sortiert[1]] : null;
    if (!erster) return { tone: 'burn', children: 'Noch keine Partie.' };
    var abstand = zweiter ? ev.per[sortiert[0]].total - ev.per[sortiert[1]].total : 0;
    if (!zweiter) return { tone: 'brag', children: erster.name + ' führt. Konkurrenz sieht anders aus.' };
    if (abstand === 0) return { tone: 'burn', children: erster.name + ' und ' + zweiter.name + ' liegen gleichauf. Das klärt die nächste Partie.' };
    return {
      tone: abstand >= 6 ? 'brag' : 'burn',
      children: abstand >= 6
        ? erster.name + ' führt mit ' + SA.plural(abstand, 'Punkt', 'Punkten') + '. Das holt so schnell keiner auf.'
        : erster.name + ' führt knapp — ' + SA.plural(abstand, 'Punkt', 'Punkten') + ' vor ' + zweiter.name + '.'
    };
  }
})();
