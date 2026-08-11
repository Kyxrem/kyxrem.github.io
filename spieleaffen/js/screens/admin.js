/* SpieleAffen — Admin.
 * Aus ui_kits/dashboard/AdminScreen.jsx: Code-Tor, Korrekturen, Affen anlegen
 * und archivieren, Änderungs-Log.
 *
 * Ein Unterschied zum Entwurf, mit Absicht:
 *
 * 1. Der Affenschlüssel ist kein geteilter Code mehr. Jeder Affe hat seinen
 *    eigenen — dieselbe PinInput, dieselbe Frechheit, aber das Log kann sagen,
 *    WER etwas geändert hat.
 * 2. Korrigiert werden Ergebnisse, nicht Endstände. Punkte, Siege und Abende
 *    rechnet die Engine aus den Abenden aus; sie direkt zu überschreiben hieße,
 *    neben die Wahrheit eine zweite zu stellen. Genau das soll das Log ja
 *    verhindern. Also wird an der Quelle korrigiert: Punktzahl, Tipp, Strafe.
 */
(function () {
  'use strict';
  var h = window.h, U = window.SA_UI, SA = window.SA, S = window.SA_STORE;

  var reiter = 'ergebnisse';
  var abendId = null;
  var entwurf = {};   // {spielId: {playerId: {score, tip, strafe}}}

  // ══ Code-Tor ═════════════════════════════════════════════════════════════
  function codeTor(state) {
    var versuche = 0;
    var karte = h('div');

    function zeichne(falsch) {
      var pin = U.PinInput({
        length: 4, invalid: falsch, autoFocus: true,
        hint: falsch ? 'Falscher Code. Der Block merkt sich das.' : 'Deine vier Ziffern. Nicht die von jemand anderem.',
        onComplete: pruefen
      });
      window.SA_DOM.mount(karte, U.Card({
        tone: falsch ? 'live' : 'neon',
        style: { width: 'min(420px, 100%)', animation: falsch ? 'sa-boing var(--dur-base) var(--ease-boing)' : null },
        eyebrow: 'Nur für Affen mit Schlüssel',
        title: 'Affenschlüssel',
        children: [
          h('span.sa-body', 'Vier Ziffern. Wer sie nicht hat, hat auch nichts zu ändern.'),
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
          versuche >= 2 ? h('span.sa-meta', { style: { color: 'var(--punsch-400)' } }, demoTipp(state)) : null
        ]
      }));
    }

    function pruefen(wert) {
      if (!wert || wert.length < 4) return;
      S.login(wert).then(function (spieler) {
        S.toast('Drin', 'Hallo ' + spieler.name + '. Bitte keine Dummheiten.', 'slime');
      }).catch(function (err) {
        versuche += 1;
        zeichne(true);
        S.toast('Falsch', err.status === 429
          ? 'Zu viele Versuche. Kurz durchatmen.'
          : versuche >= 2 ? 'Zweiter Versuch, gleiche Frechheit.' : 'Netter Versuch, Affe.', 'punsch');
      });
    }

    zeichne(false);
    return h('div', { style: { display: 'grid', justifyItems: 'center', alignItems: 'center', minHeight: '60vh', width: '100%' } }, karte);
  }

  function demoTipp(state) {
    if (state.source !== 'demo') return 'Code vergessen? Ein Admin setzt ihn neu.';
    var codes = S.demoCodes();
    var erster = Object.keys(codes)[0];
    return 'Demo-Modus. Tipp für Verzweifelte: ' + codes[erster] + ' ist ' + erster + '. Aber das bleibt unter uns.';
  }

  // ══ Ergebnisse korrigieren ═══════════════════════════════════════════════
  function ergebnisse(c) {
    var abende = c.nightInfos.slice().reverse().slice(0, 10).map(function (i) { return i.night; });
    if (!abende.length) {
      return U.Card({
        padding: '0', tone: 'sunken',
        children: h('div.sa-empty', null,
          U.Icon('history', { size: 32, color: 'var(--text-faint)' }),
          h('span.sa-empty__text', 'Nichts gespielt, nichts zu korrigieren.'))
      });
    }
    if (!abendId || !abende.some(function (n) { return n.id === abendId; })) abendId = abende[0].id;
    var abend = abende.filter(function (n) { return n.id === abendId; })[0];

    return U.Card({
      padding: '0',
      children: [
        h('div.sa-card__head', null,
          h('div.sa-card__heading', null,
            h('h3.sa-h3', 'Ergebnisse ändern'),
            h('span.sa-meta', 'Punktzahl, Tipp und Strafe — alles andere rechnet die Engine daraus.')),
          null),
        h('div', { style: { padding: '0 var(--pad-card) var(--space-5)' } },
          U.Tabs({
            variant: 'pill', value: abendId,
            items: abende.map(function (n) { return { id: n.id, label: SA.fmtDateShort(n.date) }; }),
            onChange: function (id) { abendId = id; entwurf = {}; S.emit(); }
          })),
        (abend.games || []).map(function (spiel) { return spielBlock(c, abend, spiel); }),
        h('div', { style: { padding: 'var(--space-5) var(--pad-card)' } },
          h('span.sa-meta', 'Jede Änderung landet sofort im Log. Mit Namen. Ohne Gnade.'))
      ]
    });
  }

  var SPALTEN = '1fr 92px 92px 68px 108px';

  function spielBlock(c, abend, spiel) {
    entwurf[spiel.id] = entwurf[spiel.id] || {};
    var zeilenNodes = [];

    function draft(pid, feld, original) {
      var d = entwurf[spiel.id][pid] = entwurf[spiel.id][pid] || {};
      return d[feld] !== undefined ? d[feld] : original;
    }
    function dreckig() {
      return (spiel.results || []).some(function (r) {
        var d = entwurf[spiel.id][r.playerId] || {};
        return (d.score !== undefined && Number(d.score) !== Number(r.score)) ||
               (d.tip !== undefined && String(d.tip) !== String(r.tip == null ? '' : r.tip)) ||
               (d.strafe !== undefined && !!d.strafe !== !!r.strafe);
      });
    }

    var speichern = U.Button({
      children: 'Speichern', size: 'sm', variant: 'live', iconLeft: 'check', disabled: true,
      onClick: function () { schreiben(); }
    });

    function pruefeDreckig() {
      var d = dreckig();
      speichern.disabled = !d;
      zeilenNodes.forEach(function (node) { node.classList.toggle('is-dirty', d); });
    }

    function schreiben() {
      var aenderungen = [];
      (spiel.results || []).forEach(function (r) {
        var d = entwurf[spiel.id][r.playerId] || {};
        var name = (c.playerById[r.playerId] || {}).name || r.playerId;
        if (d.score !== undefined && Number(d.score) !== Number(r.score)) {
          aenderungen.push({ pid: r.playerId, feld: 'score', von: r.score, zu: Number(d.score),
            text: 'Punktzahl von ' + name + ' bei ' + spiel.title + ' korrigiert.' });
        }
        if (d.tip !== undefined && String(d.tip) !== String(r.tip == null ? '' : r.tip)) {
          aenderungen.push({ pid: r.playerId, feld: 'tip', von: r.tip == null ? '—' : r.tip, zu: d.tip === '' ? '—' : Number(d.tip),
            text: 'Tipp von ' + name + ' bei ' + spiel.title + ' korrigiert.' });
        }
        if (d.strafe !== undefined && !!d.strafe !== !!r.strafe) {
          aenderungen.push({ pid: r.playerId, feld: 'strafe', von: r.strafe ? 'Strafe' : 'keine', zu: d.strafe ? 'Strafe' : 'keine',
            text: 'Strafe von ' + name + ' bei ' + spiel.title + (d.strafe ? ' gesetzt.' : ' gestrichen.') });
        }
      });
      if (!aenderungen.length) return;

      S.update(function (doc) {
        var n = doc.nights.filter(function (x) { return x.id === abend.id; })[0];
        if (!n) return false;
        var g = (n.games || []).filter(function (x) { return x.id === spiel.id; })[0];
        if (!g) return false;
        aenderungen.forEach(function (a) {
          var r = g.results.filter(function (x) { return x.playerId === a.pid; })[0];
          if (!r) return;
          if (a.feld === 'score') r.score = a.zu;
          if (a.feld === 'tip') { if (a.zu === '—') delete r.tip; else r.tip = a.zu; }
          if (a.feld === 'strafe') { if (a.zu === 'Strafe') r.strafe = true; else delete r.strafe; }
        });
      }, {
        summary: spiel.title + ' am ' + SA.fmtDate(abend.date) + ' korrigiert',
        entries: aenderungen.map(function (a) {
          return { icon: 'edit', tone: 'punsch', text: a.text, from: a.von, to: a.zu };
        })
      }).then(function () {
        entwurf[spiel.id] = {};
        S.toast('Geändert', aenderungen.length + ' Korrektur' + (aenderungen.length === 1 ? '' : 'en') + '. Steht im Log.', 'punsch');
      }).catch(function () { /* Meldung kam schon vom Store */ });
    }

    return h('div', null,
      h('div.sa-thead', { style: { gridTemplateColumns: SPALTEN } },
        h('span', spiel.title), h('span', 'Punkte'), h('span', 'Tipp'), h('span', 'Strafe'), h('span', '')),
      h('div.sa-scrollx', null, h('div', null, (spiel.results || []).map(function (r, i) {
        var affe = c.playerById[r.playerId] || { name: r.playerId, seat: 1 };
        var punkte = U.Input({
          size: 'sm', inputMode: 'numeric', value: String(r.score),
          onInput: function (e) { entwurf[spiel.id][r.playerId] = entwurf[spiel.id][r.playerId] || {}; entwurf[spiel.id][r.playerId].score = e.target.value; pruefeDreckig(); }
        });
        var tipp = U.Input({
          size: 'sm', inputMode: 'numeric', value: r.tip == null ? '' : String(r.tip), placeholder: '—',
          onInput: function (e) { entwurf[spiel.id][r.playerId] = entwurf[spiel.id][r.playerId] || {}; entwurf[spiel.id][r.playerId].tip = e.target.value; pruefeDreckig(); }
        });
        var strafe = U.Checkbox({
          label: '', checked: !!r.strafe,
          onChange: function (e) { entwurf[spiel.id][r.playerId] = entwurf[spiel.id][r.playerId] || {}; entwurf[spiel.id][r.playerId].strafe = e.target.checked; pruefeDreckig(); }
        });
        var node = h('div.sa-trow', { style: { gridTemplateColumns: SPALTEN } },
          h('span.sa-inline', { style: { flexWrap: 'nowrap', minWidth: 0 } },
            U.PlayerAvatar({ name: affe.name, seat: affe.seat, size: 'sm' }),
            h('span.sa-strong.sa-truncate', affe.name)),
          punkte, tipp, strafe,
          i === 0 ? h('span', { style: { display: 'flex', justifyContent: 'flex-end' } }, speichern) : h('span'));
        zeilenNodes.push(node);
        return node;
      })))
    );
  }

  // ══ Affen ════════════════════════════════════════════════════════════════
  function affenListe(c) {
    var aktiv = c.players.filter(function (p) { return !p.archived; });
    var archiv = c.players.filter(function (p) { return p.archived; });
    var frei = SA.freeSeats(c.players);

    function archivieren(p) {
      S.update(function (doc) {
        var x = doc.players.filter(function (y) { return y.id === p.id; })[0];
        if (!x) return false;
        x.archived = true;
      }, {
        summary: p.name + ' archiviert',
        entries: [{ icon: 'archive', tone: 'punsch', text: p.name + ' archiviert. Seat ' + p.seat + ' ist wieder frei.' }]
      }).then(function () { S.toast('Archiviert', p.name + ' ist raus. Die Punkte bleiben stehen.', 'punsch'); })
        .catch(function () { /* Meldung kam schon vom Store */ });
    }
    function zurueckholen(p) {
      if (aktiv.some(function (x) { return Number(x.seat) === Number(p.seat); })) {
        S.toast('Geht nicht', 'Seat ' + p.seat + ' ist inzwischen belegt.', 'punsch');
        return;
      }
      S.update(function (doc) {
        var x = doc.players.filter(function (y) { return y.id === p.id; })[0];
        if (!x) return false;
        x.archived = false;
      }, {
        summary: p.name + ' zurückgeholt',
        entries: [{ icon: 'undo', tone: 'slime', text: p.name + ' zurückgeholt (Seat ' + p.seat + ').' }]
      }).then(function () { S.toast('Zurück', p.name + ' spielt wieder mit. Mutig.', 'slime'); })
        .catch(function () { /* Meldung kam schon vom Store */ });
    }

    return U.Card({
      padding: '0',
      children: [
        h('div.sa-card__head', null,
          h('div.sa-card__heading', null, h('h3.sa-h3', 'Affen')),
          U.Button({ children: 'Affe hinzufügen', size: 'sm', iconLeft: 'user-plus', onClick: window.SA_DIALOGS.affeHinzufuegen })),
        aktiv.map(function (p) {
          var stand = S.affen('all', { includeEmpty: true }).filter(function (a) { return a.id === p.id; })[0] || { nights: 0, wins: 0 };
          return h('div.sa-row', null,
            U.PlayerAvatar({ name: p.name, seat: p.seat }),
            h('span', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 } },
              h('span.sa-strong.sa-truncate', p.name + (p.admin ? ' · Admin' : '')),
              h('span.sa-meta', 'Seat ' + p.seat + ' · ' + stand.nights + ' Abende · ' + stand.wins + ' Siege')),
            U.Tag({ children: 'Seat ' + p.seat, color: U.seatVar(p.seat), size: 'sm' }),
            U.IconButton({
              icon: p.admin ? 'admin_panel_settings' : 'shield',
              label: p.admin ? p.name + ' die Adminrechte nehmen' : p.name + ' zum Admin machen',
              variant: 'outline', size: 'sm', active: !!p.admin,
              onClick: function () { adminUmschalten(c, p); }
            }),
            U.IconButton({
              icon: 'archive', label: 'Archivieren: ' + p.name, variant: 'outline', size: 'sm',
              onClick: function () { archivieren(p); }
            }));
        }),
        archiv.length ? [
          h('div', { style: { padding: 'var(--space-5) var(--pad-card)', borderTop: '1px solid var(--line)', background: 'var(--surface-inset)' } },
            h('span.sa-eyebrow', 'Archiv · ' + archiv.length)),
          archiv.map(function (p) {
            var belegt = aktiv.some(function (x) { return Number(x.seat) === Number(p.seat); });
            return h('div.sa-row', { style: { opacity: .7 } },
              U.PlayerAvatar({ name: p.name, seat: p.seat, size: 'sm' }),
              h('span.sa-body', { style: { flex: 1 } }, p.name),
              h('span.sa-meta', belegt ? 'Seat ' + p.seat + ' inzwischen belegt' : 'Seat ' + p.seat + ' frei'),
              U.Button({ children: 'Zurückholen', size: 'sm', variant: 'ghost', iconLeft: 'undo', disabled: belegt, onClick: function () { zurueckholen(p); } }));
          })
        ] : null,
        h('div.sa-row', { style: { justifyContent: 'space-between' } },
          h('span.sa-body', 'Sechs Sitzfarben, ' + frei.length + ' frei. Archivieren gibt eine zurück.'),
          U.Button({ children: 'Affe hinzufügen', size: 'sm', iconLeft: 'user-plus', onClick: window.SA_DIALOGS.affeHinzufuegen }))
      ]
    });
  }

  function adminUmschalten(c, p) {
    var aktive = c.players.filter(function (x) { return x.admin && !x.archived; });
    if (p.admin && aktive.length <= 1) {
      S.toast('Geht nicht', 'Einer muss den Schlüssel behalten.', 'punsch');
      return;
    }
    S.update(function (doc) {
      var x = doc.players.filter(function (y) { return y.id === p.id; })[0];
      if (!x) return false;
      x.admin = !x.admin;
    }, {
      summary: p.name + (p.admin ? ' ist kein Admin mehr' : ' ist jetzt Admin'),
      entries: [{ icon: 'admin_panel_settings', tone: 'punsch', text: 'Adminrechte für ' + p.name + ' geändert.', from: p.admin ? 'Admin' : 'Affe', to: p.admin ? 'Affe' : 'Admin' }]
    });
  }

  // ══ Codes ════════════════════════════════════════════════════════════════
  /* Vier Ziffern sind schwach — zehntausend Möglichkeiten. Für einen privaten
     Spieleabend reicht das; der Worker bremst Rateversuche aus. Gespeichert
     wird nie der Code selbst, sondern nur sein Hash. */
  function codes(state, c) {
    var demo = state.source === 'demo';
    var vorhanden = demo ? S.demoCodes() : {};

    return U.Card({
      padding: '0',
      children: [
        h('div.sa-card__head', null,
          h('div.sa-card__heading', null,
            h('h3.sa-h3', 'Codes'),
            h('span.sa-meta', 'Jeder Affe trägt mit seinen eigenen vier Ziffern ein. Deshalb steht im Log ein Name.')),
          U.Badge({ children: demo ? 'Demo' : 'Server', tone: demo ? 'punsch' : 'slime', size: 'sm' })),
        c.players.filter(function (p) { return !p.archived; }).map(function (p) {
          var pin = U.PinInput({ length: 4, mask: !demo, value: demo ? (vorhanden[p.id] || '') : '' });
          return h('div.sa-row', { style: { alignItems: 'center', flexWrap: 'wrap' } },
            U.PlayerAvatar({ name: p.name, seat: p.seat, size: 'sm' }),
            h('span.sa-strong', { style: { flex: 1, minWidth: '90px' } }, p.name),
            pin,
            U.Button({
              children: 'Setzen', size: 'sm', variant: 'secondary', iconLeft: 'key',
              onClick: function () {
                var wert = Array.prototype.map.call(pin.querySelectorAll('input'), function (i) { return i.value; }).join('');
                if (wert.length !== 4) { S.toast('Vier Ziffern', 'Nicht drei, nicht fünf.', 'punsch'); return; }
                setzeCode(p, wert, demo);
              }
            }),
            U.IconButton({
              icon: 'lock_reset', label: 'Code von ' + p.name + ' löschen', variant: 'outline', size: 'sm',
              onClick: function () { setzeCode(p, null, demo); pin.clear(); }
            }));
        }),
        h('div', { style: { padding: 'var(--space-5) var(--pad-card)' } },
          h('span.sa-meta', demo
            ? 'Im Demo-Modus stehen die Codes im Klartext im Browser. Mit Server werden nur Hashes gespeichert.'
            : 'Gespeichert wird nur ein SHA-256-Hash. Ein vergessener Code wird nicht gefunden, sondern neu gesetzt.'))
      ]
    });
  }

  function setzeCode(p, code, demo) {
    var fertig = function () {
      S.toast(code ? 'Code steht' : 'Code weg', code
        ? p.name + ' kommt jetzt mit den eigenen vier Ziffern rein.'
        : p.name + ' kommt gar nicht mehr rein. Absicht?', code ? 'slime' : 'punsch');
    };
    if (demo) { S.setDemoCode(p.id, code); fertig(); S.emit(); return; }
    window.SA_API.setCode(p.id, code).then(fertig).catch(function (err) {
      S.toast('Nicht gesetzt', err.message, 'punsch');
    });
  }

  // ══ Änderungs-Log ════════════════════════════════════════════════════════
  function log(state) {
    var eintraege = state.log || [];
    return [
      U.StatTile({
        label: 'Einträge im Log', value: eintraege.length, icon: 'history',
        tone: eintraege.length ? 'punsch' : 'neutral',
        delta: eintraege.length ? 'zuletzt: ' + String(eintraege[0].text).slice(0, 26) + '…' : 'noch sauber',
        deltaDirection: eintraege.length ? 'down' : 'up'
      }),
      U.Card({
        padding: '0',
        children: [
          h('div.sa-card__head', null,
            h('div.sa-card__heading', null, h('h3.sa-h3', 'Änderungs-Log')),
            U.Badge({ children: String(eintraege.length), tone: 'punsch', size: 'sm', dot: true })),
          eintraege.length
            ? eintraege.slice(0, 40).map(function (e) { return U.LogEntry(e); })
            : h('div.sa-empty', null, h('span.sa-empty__text', 'Nichts manipuliert. Bisher.'))
        ]
      }),
      U.Card({
        tone: 'sunken', eyebrow: 'Hausregel #0', title: 'Der Admin hat immer recht.',
        children: h('span.sa-body', 'Das Log hat trotzdem recht behalten.')
      }),
      state.source === 'demo' ? U.Card({
        tone: 'sunken', eyebrow: 'Demo', title: 'Alles zurücksetzen',
        children: [
          h('span.sa-body', 'Setzt die Beispieldaten, Codes und das Log im Browser zurück.'),
          U.Button({ children: 'Zurücksetzen', size: 'sm', variant: 'secondary', iconLeft: 'restart_alt', onClick: S.resetDemo })
        ]
      }) : null
    ];
  }

  // ══ Screen ═══════════════════════════════════════════════════════════════
  window.SA_SCREENS = window.SA_SCREENS || {};
  window.SA_SCREENS.admin = function (state, c) {
    var SH = window.SA_SHELL;

    if (!state.me) {
      return [
        SH.ScreenHead({ eyebrow: 'Admin', title: 'Abgeschlossen', sub: 'Eintragen und ändern darf nur, wer seinen Code kennt.' }),
        codeTor(state)
      ];
    }

    var istAdmin = S.istAdmin();
    var reiterItems = [
      { id: 'ergebnisse', label: 'Ergebnisse' },
      { id: 'affen', label: 'Affen', count: c.players.filter(function (p) { return !p.archived; }).length }
    ];
    if (istAdmin) reiterItems.push({ id: 'codes', label: 'Codes' });
    if (!istAdmin && reiter === 'codes') reiter = 'ergebnisse';

    return [
      SH.ScreenHead({
        eyebrow: 'Angemeldet als ' + state.me.name + (istAdmin ? ' · Admin' : ''),
        title: 'Admin',
        sub: istAdmin
          ? 'Hier wird die Geschichte umgeschrieben. Alles davon steht im Log.'
          : 'Eintragen darfst du. Umschreiben nur ein Admin. Auch das steht im Log.',
        actions: [
          U.Badge({ children: istAdmin ? 'Admin' : 'Affe', tone: istAdmin ? 'punsch' : 'neutral', variant: 'solid', icon: 'admin_panel_settings' }),
          U.Button({ children: 'Affe hinzufügen', variant: 'secondary', iconLeft: 'user-plus', disabled: !istAdmin, onClick: window.SA_DIALOGS.affeHinzufuegen }),
          U.Button({
            children: 'Abmelden', variant: 'ghost', iconLeft: 'lock',
            onClick: function () { S.logout().then(function () { S.toast('Abgemeldet', 'Der Code bleibt am Kühlschrank.', 'neutral'); }); }
          })
        ]
      }),
      h('div.sa-cols.sa-cols--admin', null,
        h('div.sa-stack', null,
          U.Tabs({ value: reiter, items: reiterItems, onChange: function (id) { reiter = id; S.emit(); } }),
          reiter === 'ergebnisse' ? ergebnisse(c) : reiter === 'affen' ? affenListe(c) : codes(state, c)),
        h('div.sa-stack', log(state)))
    ];
  };
})();
