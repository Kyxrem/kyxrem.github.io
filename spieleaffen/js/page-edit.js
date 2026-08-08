/* Eintragen: Token-Zugang, Abend-Wizard, Planung/RSVP, Verwaltung, Protokoll.
   Jede Änderung wird als Commit mit Namens-Attribution + Audit-Eintrag gespeichert. */
(async function () {
  'use strict';
  const { h } = UI;
  const app = UI.qs('#app');
  UI.tabbar(null);

  const params = new URLSearchParams(location.search);
  let data = null;
  let session = API.isDemo() ? { name: 'Demo-Affe', token: 'demo' } : API.session();

  async function reload() {
    data = await API.loadData();
    return data;
  }
  try { await reload(); }
  catch (e) { UI.fail(app, e); return; }

  const head = h('header', { class: 'pagehead' },
    h('div', null,
      h('div', { class: 'eyebrow acid' }, 'SPIELEAFFEN · EINTRAGEN'),
      h('h1', null, 'Eintragen')),
    h('div', { class: 'meta', id: 'who' }));
  const body = h('div');
  app.append(head, body);
  UI.demoBanner(app);

  function setWho() {
    UI.qs('#who').innerHTML = session ? 'angemeldet als<br><b style="color:var(--acid)">' + session.name + '</b>' : 'nicht<br>angemeldet';
  }

  /* ---------- Speichern mit UI-Drumherum ---------- */
  async function save(message, mutator, btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Speichert…'; }
    try {
      await API.saveData({ token: session.token, who: session.name, message, mutator });
      await reload();
      UI.toast('Gespeichert — Commit von ' + session.name + ' ✓');
      return true;
    } catch (e) {
      UI.toast(String(e.message || e), true);
      return false;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = btn.dataset.label || 'Speichern'; }
    }
  }

  const uid = (prefix) => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  /* ================= Ansichten ================= */

  function gateView() {
    setWho();
    const input = h('input', { class: 'input', type: 'password', placeholder: 'Dein Zugangs-Token', autocomplete: 'off' });
    const err = h('div', { class: 'small', style: 'color:var(--alert);min-height:16px' });
    const btn = h('button', { class: 'btn block', 'data-label': 'Rein da' }, 'Rein da');
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = 'Prüfe…'; err.textContent = '';
      try {
        const who = await API.whoami(input.value);
        session = { token: input.value.trim(), name: who.name };
        API.setSession(session);
        homeView();
      } catch (e) { err.textContent = String(e.message || e); }
      btn.disabled = false; btn.textContent = 'Rein da';
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') btn.click(); });
    UI.clear(body).append(h('div', { class: 'section', style: 'padding-top:20px' },
      h('div', { class: 'card' },
        h('div', { class: 'eyebrow acid' }, 'ZUTRITT NUR MIT TOKEN'),
        h('div', { style: 'font:600 17px/1.3 var(--sys);margin-top:10px' }, 'Wer bist du?'),
        h('p', { class: 'small muted', style: 'margin-top:6px' },
          'Jede Person hat ihr eigenes Zugangs-Token — damit steht bei jeder Änderung dabei, wer sie gemacht hat. Du bekommst deins vom Verwalter der Runde.'),
        h('div', { class: 'stack mt14' }, input, err, btn))),
      h('div', { class: 'section center' },
        h('a', { class: 'small muted', href: 'index.html' + (API.isDemo() ? '?demo' : '') }, '← Zurück zur Übersicht')));
  }

  function actionCard(icon, title, sub, onclick) {
    return h('button', { class: 'card flat hstack', style: 'gap:13px;width:100%;text-align:left;cursor:pointer', onclick },
      h('div', { class: 'badge won', style: 'font-size:17px' }, icon),
      h('div', { class: 'grow' },
        h('div', { style: 'font:600 13.5px/1.2 var(--sys)' }, title),
        h('div', { class: 'small muted', style: 'margin-top:3px' }, sub)),
      h('div', { class: 'muted' }, '›'));
  }

  function homeView() {
    setWho();
    const auditRows = (data.audit || []).slice(0, 30).map((a) =>
      h('div', { class: 'audit' },
        h('div', { class: 'when', style: 'white-space:pre-line' },
          String(a.t || '').replace('Z', '').slice(2, 16).replace('T', '\n')),
        h('div', { class: 'what', html: '<b>' + a.who + '</b> · ' + a.msg })));
    UI.clear(body).append(
      h('div', { class: 'section stack', style: 'padding-top:6px' },
        actionCard('🎲', 'Abend eintragen', 'Ergebnisse, Tipps, fertig — die Tabelle rechnet selbst', () => eveningView(null)),
        actionCard('📅', 'Nächsten Abend planen', 'Termin, Gastgeber, Plan — und wer zusagt', nextView),
        actionCard('✏️', 'Abende bearbeiten', 'Alte Abende korrigieren oder löschen', listView),
        actionCard('⚙️', 'Verwaltung', 'Affen, Saisons, Punktewertung', manageView)),
      h('div', { class: 'sectionhead' },
        h('div', { class: 'eyebrow' }, 'Protokoll — wer hat was gemacht'),
        h('button', { class: 'more', style: 'background:none', onclick: () => { API.setSession(null); session = null; gateView(); } }, 'Abmelden')),
      h('div', { class: 'section' },
        h('div', { class: 'card' }, auditRows.length ? auditRows : h('div', { class: 'small muted' }, 'Noch keine Einträge.'))));
  }

  /* ---------- Abend eintragen / bearbeiten ---------- */
  function eveningView(existing) {
    setWho();
    const players = data.players.filter((p) => p.active !== false);
    if (!players.length) { UI.toast('Erst Spieler anlegen (Verwaltung).', true); manageView(); return; }

    const knownGames = {};
    (data.evenings || []).forEach((ev) => (ev.games || []).forEach((g) => { knownGames[g.name] = { lowWins: !!g.lowWins }; }));
    ['Catan', 'Dune Imperium', 'Wizard', '6 nimmt!', 'Azul', 'Carcassonne', '7 Wonders'].forEach((n) => { if (!knownGames[n]) knownGames[n] = { lowWins: n === '6 nimmt!' }; });

    const st = {
      date: existing ? existing.date : (data.next && data.next.date && data.next.date <= Engine.todayISO() ? data.next.date : Engine.todayISO()),
      hostId: existing ? existing.hostId : (data.next ? data.next.hostId : null),
      attendees: existing ? [...new Set((existing.games || []).flatMap((g) => g.results.map((r) => r.playerId)))] : players.map((p) => p.id),
      games: existing ? existing.games.map((g) => ({
        name: g.name, minutes: g.minutes || '', lowWins: !!g.lowWins,
        scores: Object.fromEntries(g.results.map((r) => [r.playerId, r.score])),
        tips: { ...(g.tips || {}) }
      })) : [{ name: '', minutes: '', lowWins: false, scores: {}, tips: {} }]
    };

    const dateIn = h('input', { class: 'input', type: 'date', value: st.date });
    const hostSel = h('select', { class: 'input' },
      h('option', { value: '' }, 'Gastgeber?'),
      players.map((p) => h('option', { value: p.id, selected: p.id === st.hostId }, p.name)));

    const attWrap = h('div', { class: 'chips', style: 'padding:0' });
    function drawAtt() {
      UI.clear(attWrap).append(...players.map((p) =>
        h('button', {
          class: 'chip' + (st.attendees.includes(p.id) ? ' on' : ''),
          onclick: () => {
            if (st.attendees.includes(p.id)) st.attendees = st.attendees.filter((x) => x !== p.id);
            else st.attendees.push(p.id);
            drawAtt(); drawGames(); preview();
          }
        }, p.monkey + ' ' + p.name)));
    }

    const gamesBox = h('div', { class: 'stack' });
    const dl = h('datalist', { id: 'gamenames' }, Object.keys(knownGames).map((n) => h('option', { value: n })));

    function gameCard(g, idx) {
      const nameIn = h('input', { class: 'input', list: 'gamenames', placeholder: 'Spiel (z.B. Catan)', value: g.name });
      nameIn.addEventListener('change', () => {
        g.name = nameIn.value.trim();
        if (knownGames[g.name]) { g.lowWins = knownGames[g.name].lowWins; lowChk.checked = g.lowWins; }
        preview();
      });
      const minIn = h('input', { class: 'input', type: 'number', inputmode: 'numeric', placeholder: 'Min.', value: g.minutes, style: 'width:86px;flex:none' });
      minIn.addEventListener('input', () => { g.minutes = minIn.value; });
      const lowChk = h('input', { type: 'checkbox', checked: g.lowWins, id: 'low' + idx });
      lowChk.addEventListener('change', () => { g.lowWins = lowChk.checked; preview(); });

      const rows = st.attendees.map((pid) => {
        const p = Engine.player(data, pid);
        const sc = h('input', { class: 'input num', type: 'number', inputmode: 'numeric', placeholder: '–', value: g.scores[pid] ?? '' });
        sc.addEventListener('input', () => {
          if (sc.value === '') delete g.scores[pid]; else g.scores[pid] = Number(sc.value);
          preview();
        });
        const tp = h('input', { class: 'input num', type: 'number', inputmode: 'numeric', placeholder: 'Tipp', value: g.tips[pid] ?? '', style: 'opacity:.8' });
        tp.addEventListener('input', () => {
          if (tp.value === '') delete g.tips[pid]; else g.tips[pid] = Number(tp.value);
          preview();
        });
        return h('div', { style: 'display:grid;grid-template-columns:1fr 78px 78px;gap:8px;align-items:center' },
          h('div', { class: 'small', style: 'font-weight:600' }, p.monkey + ' ' + p.name), sc, tp);
      });

      return h('div', { class: 'card flat stack' },
        h('div', { class: 'hstack' },
          nameIn, minIn,
          st.games.length > 1 ? h('button', { class: 'btn ghost sm', style: 'flex:none', onclick: () => { st.games.splice(idx, 1); drawGames(); preview(); } }, '✕') : null),
        h('label', { class: 'hstack small muted', style: 'gap:8px;cursor:pointer', for: 'low' + idx },
          lowChk, 'Weniger ist mehr (z.B. 6 nimmt!)'),
        h('div', { style: 'display:grid;grid-template-columns:1fr 78px 78px;gap:8px', class: 'eyebrow' },
          h('div', null, 'SPIELER'), h('div', { class: 'center' }, 'PUNKTE'), h('div', { class: 'center' }, 'TIPP')),
        h('div', { class: 'stack', style: 'gap:8px' }, rows));
    }

    function drawGames() {
      UI.clear(gamesBox).append(
        ...st.games.map((g, i) => gameCard(g, i)),
        h('button', {
          class: 'btn ghost block', onclick: () => { st.games.push({ name: '', minutes: '', lowWins: false, scores: {}, tips: {} }); drawGames(); }
        }, '+ Spiel hinzufügen'));
    }

    const prevBox = h('div');
    function buildEvening() {
      const games = st.games
        .filter((g) => g.name && Object.keys(g.scores).length >= 2)
        .map((g) => ({
          id: uid('g'), name: g.name, minutes: g.minutes ? Number(g.minutes) : undefined, lowWins: g.lowWins || undefined,
          results: Object.entries(g.scores).map(([playerId, score]) => ({ playerId, score })),
          tips: Object.fromEntries(Object.entries(g.tips).filter(([pid]) => g.scores[pid] !== undefined))
        }));
      return {
        id: existing ? existing.id : uid('e'),
        seasonId: existing ? existing.seasonId : data.activeSeasonId,
        date: dateIn.value, hostId: hostSel.value || null, games
      };
    }
    function preview() {
      const ev = buildEvening();
      UI.clear(prevBox);
      if (!ev.games.length) { prevBox.append(h('div', { class: 'small muted center' }, 'Mindestens ein Spiel mit 2+ Punktzahlen eintragen.')); return; }
      const stats = Engine.eveningStats(ev, data.settings);
      prevBox.append(h('div', { class: 'card flat' },
        h('div', { class: 'eyebrow acid', style: 'margin-bottom:10px' }, 'VORSCHAU — ABENDWERTUNG'),
        stats.ranking.map((r) => {
          const p = Engine.player(data, r.playerId);
          const d = stats.per[r.playerId];
          return h('div', { class: 'mini' },
            h('div', { class: 'rk' + (r.rank === 1 ? ' win' : '') }, String(r.rank)),
            h('div', { class: 'nm' + (r.rank === 1 ? ' win' : '') }, p.name,
              h('span', { class: 'muted', style: 'font-size:10px' },
                '  ' + d.gamePts + ' Platzierung + ' + d.tipPts + ' Tipp + ' + d.att + ' Antreten')),
            h('div', { class: 'sc win' }, r.pts + ' P'));
        })));
    }

    const saveBtn = h('button', { class: 'btn block', 'data-label': existing ? 'Änderungen speichern' : 'Abend speichern' }, existing ? 'Änderungen speichern' : 'Abend speichern');
    saveBtn.addEventListener('click', async () => {
      const ev = buildEvening();
      if (!ev.date) { UI.toast('Datum fehlt.', true); return; }
      if (!ev.games.length) { UI.toast('Mindestens ein Spiel mit 2+ Punktzahlen.', true); return; }
      const msg = existing
        ? 'Abend ' + Engine.fmtShort(ev.date) + ' geändert'
        : 'Abend ' + Engine.fmtShort(ev.date) + ' eingetragen (' + ev.games.length + (ev.games.length === 1 ? ' Spiel, ' : ' Spiele, ') +
          [...new Set(ev.games.flatMap((g) => g.results.map((r) => r.playerId)))].length + ' Spieler)';
      const ok = await save(msg, (d) => {
        d.evenings = d.evenings || [];
        const i = d.evenings.findIndex((x) => x.id === ev.id);
        if (i >= 0) d.evenings[i] = ev; else d.evenings.push(ev);
        if (!existing && d.next && d.next.date === ev.date) d.next = null; // geplanter Abend ist jetzt Geschichte
      }, saveBtn);
      if (ok) homeView();
    });

    const delBtn = existing ? h('button', { class: 'btn danger block', 'data-label': 'Abend löschen' }, 'Abend löschen') : null;
    if (delBtn) delBtn.addEventListener('click', async () => {
      if (!window.confirm('Abend vom ' + Engine.fmtLong(existing.date) + ' wirklich löschen?')) return;
      const ok = await save('Abend ' + Engine.fmtShort(existing.date) + ' gelöscht',
        (d) => { d.evenings = (d.evenings || []).filter((x) => x.id !== existing.id); }, delBtn);
      if (ok) homeView();
    });

    UI.clear(body).append(dl,
      h('div', { class: 'section stack', style: 'padding-top:6px' },
        h('button', { class: 'small muted', style: 'text-align:left;background:none', onclick: homeView }, '← Zurück'),
        h('div', { class: 'card stack' },
          h('div', { class: 'eyebrow acid' }, existing ? 'ABEND BEARBEITEN' : 'NEUER ABEND'),
          h('div', { class: 'hstack' },
            h('div', { class: 'field grow' }, h('label', null, 'Datum'), dateIn),
            h('div', { class: 'field grow' }, h('label', null, 'Gastgeber'), hostSel)),
          h('div', { class: 'field' }, h('label', null, 'Wer war da?'), attWrap)),
        gamesBox,
        prevBox,
        saveBtn, delBtn));
    drawAtt(); drawGames(); preview();
  }

  /* ---------- Abende-Liste zum Bearbeiten ---------- */
  function listView() {
    setWho();
    const evs = [...(data.evenings || [])].sort((a, b) => (a.date < b.date ? 1 : -1));
    UI.clear(body).append(h('div', { class: 'section stack', style: 'padding-top:6px' },
      h('button', { class: 'small muted', style: 'text-align:left;background:none', onclick: homeView }, '← Zurück'),
      evs.length ? evs.map((ev) => actionCard('🎲',
        Engine.fmtFull(ev.date),
        (ev.games || []).map((g) => g.name).join(' + ') || 'keine Spiele',
        () => eveningView(ev))) :
        h('div', { class: 'empty' }, h('p', null, 'Noch keine Abende da.'))));
  }

  /* ---------- Nächster Abend + RSVP ---------- */
  function nextView() {
    setWho();
    const players = data.players.filter((p) => p.active !== false);
    const nx = data.next ? structuredClone(data.next) : { date: '', time: '19:30', hostId: null, plan: '', rsvp: {} };
    const dateIn = h('input', { class: 'input', type: 'date', value: nx.date });
    const timeIn = h('input', { class: 'input', type: 'time', value: nx.time || '19:30' });
    const hostSel = h('select', { class: 'input' },
      h('option', { value: '' }, 'Gastgeber?'),
      players.map((p) => h('option', { value: p.id, selected: p.id === nx.hostId }, p.name)));
    const planIn = h('input', { class: 'input', placeholder: 'Plan (z.B. Dune Imperium, danach 6 nimmt!)', value: nx.plan || '' });

    const rsvpBox = h('div', { class: 'stack', style: 'gap:8px' });
    function drawRsvp() {
      UI.clear(rsvpBox).append(...players.map((p) => {
        const v = (nx.rsvp || {})[p.id] || '';
        const mk = (val, label, cls) => h('button', {
          class: 'chip' + (v === val ? ' on' : ''), style: v === val && val === 'no' ? 'background:var(--alert);color:#fff' : '',
          onclick: () => { nx.rsvp = nx.rsvp || {}; nx.rsvp[p.id] = (v === val ? '' : val); drawRsvp(); }
        }, label);
        return h('div', { class: 'between' },
          h('div', { class: 'small', style: 'font-weight:600' }, p.monkey + ' ' + p.name),
          h('div', { class: 'hstack', style: 'gap:6px' }, mk('yes', 'Bin da'), mk('no', 'Raus')));
      }));
    }

    const saveBtn = h('button', { class: 'btn block', 'data-label': 'Speichern' }, 'Speichern');
    saveBtn.addEventListener('click', async () => {
      if (!dateIn.value) { UI.toast('Datum fehlt.', true); return; }
      const fresh = { date: dateIn.value, time: timeIn.value, hostId: hostSel.value || null, plan: planIn.value.trim(), rsvp: nx.rsvp || {} };
      const host = fresh.hostId ? Engine.player(data, fresh.hostId).name : '?';
      const ok = await save('Nächster Abend: ' + Engine.fmtShort(fresh.date) + ' bei ' + host +
        ' · ' + Object.values(fresh.rsvp).filter((x) => x === 'yes').length + ' Zusagen',
        (d) => { d.next = fresh; }, saveBtn);
      if (ok) homeView();
    });
    const clearBtn = h('button', { class: 'btn ghost block', 'data-label': 'Termin streichen' }, 'Termin streichen');
    clearBtn.addEventListener('click', async () => {
      if (!data.next) { homeView(); return; }
      const ok = await save('Nächster Abend gestrichen', (d) => { d.next = null; }, clearBtn);
      if (ok) homeView();
    });

    UI.clear(body).append(h('div', { class: 'section stack', style: 'padding-top:6px' },
      h('button', { class: 'small muted', style: 'text-align:left;background:none', onclick: homeView }, '← Zurück'),
      h('div', { class: 'card stack' },
        h('div', { class: 'eyebrow acid' }, 'NÄCHSTER ABEND'),
        h('div', { class: 'hstack' },
          h('div', { class: 'field grow' }, h('label', null, 'Datum'), dateIn),
          h('div', { class: 'field', style: 'width:110px' }, h('label', null, 'Uhrzeit'), timeIn)),
        h('div', { class: 'field' }, h('label', null, 'Gastgeber'), hostSel),
        h('div', { class: 'field' }, h('label', null, 'Plan'), planIn)),
      h('div', { class: 'card stack' },
        h('div', { class: 'eyebrow' }, 'WER SAGT ZU?'), rsvpBox),
      saveBtn, data.next ? clearBtn : null));
    drawRsvp();
  }

  /* ---------- Verwaltung ---------- */
  function manageView() {
    setWho();
    const MONKEYS = ['🐵', '🦍', '🦧', '🙈', '🙉', '🙊', '🐒', '🦁', '🐸', '🦊'];

    /* Spieler */
    const plBox = h('div', { class: 'stack', style: 'gap:8px' });
    function drawPlayers() {
      UI.clear(plBox).append(...data.players.map((p) => h('div', { class: 'between' },
        h('div', { class: 'small', style: 'font-weight:600;opacity:' + (p.active === false ? '.4' : '1') },
          p.monkey + ' ' + p.name + (p.active === false ? ' (inaktiv)' : '')),
        h('div', { class: 'hstack', style: 'gap:6px' },
          h('button', {
            class: 'chip', onclick: async () => {
              const name = window.prompt('Neuer Name für ' + p.name + ':', p.name);
              if (!name || name === p.name) return;
              await save('Spieler umbenannt: ' + p.name + ' → ' + name, (d) => {
                const x = d.players.find((y) => y.id === p.id); if (x) x.name = name;
              });
              manageView();
            }
          }, '✏️'),
          h('button', {
            class: 'chip', onclick: async () => {
              await save('Spieler ' + p.name + (p.active === false ? ' aktiviert' : ' deaktiviert'), (d) => {
                const x = d.players.find((y) => y.id === p.id); if (x) x.active = x.active === false;
              });
              manageView();
            }
          }, p.active === false ? '↩︎' : '💤')))));
    }
    const newName = h('input', { class: 'input grow', placeholder: 'Neuer Affe…' });
    const addBtn = h('button', { class: 'btn sm', style: 'flex:none', 'data-label': '+ Dazu' }, '+ Dazu');
    addBtn.addEventListener('click', async () => {
      const name = newName.value.trim();
      if (!name) return;
      let id = name.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-');
      if (data.players.some((p) => p.id === id)) id += '-' + Math.random().toString(36).slice(2, 4);
      const monkey = MONKEYS[data.players.length % MONKEYS.length];
      const ok = await save('Spieler ' + name + ' hinzugefügt', (d) => {
        d.players.push({ id, name, monkey, active: true });
      }, addBtn);
      if (ok) { newName.value = ''; manageView(); }
    });

    /* Saisons */
    const seasonRows = data.seasons.map((s) => h('div', { class: 'between' },
      h('div', { class: 'small', style: 'font-weight:600' },
        s.name + ' · ' + (s.label || '') + (s.id === data.activeSeasonId ? ' — läuft' : Engine.seasonFinished(s) ? ' — vorbei' : '')),
      s.id !== data.activeSeasonId ? h('button', {
        class: 'chip', onclick: async () => {
          await save(s.name + ' aktiviert', (d) => { d.activeSeasonId = s.id; });
          manageView();
        }
      }, 'Aktivieren') : null));
    const newSeasonBtn = h('button', { class: 'btn ghost block', 'data-label': 'Neue Saison starten' }, 'Neue Saison starten');
    newSeasonBtn.addEventListener('click', async () => {
      const n = data.seasons.length + 1;
      const label = window.prompt('Untertitel der neuen Saison (z.B. Winter 26/27):', '');
      if (label === null) return;
      const start = Engine.todayISO();
      const end = window.prompt('Ende (JJJJ-MM-TT) — Datum, an dem die Saison gewertet wird:', '');
      const id = 's' + n + '-' + Math.random().toString(36).slice(2, 4);
      const ok = await save('Saison ' + n + ' gestartet' + (label ? ' (' + label + ')' : ''), (d) => {
        d.seasons.push({ id, name: 'Saison ' + n, label: label || '', start, end: end || null });
        d.activeSeasonId = id;
      }, newSeasonBtn);
      if (ok) manageView();
    });

    /* Wertung */
    const s = data.settings;
    const p1 = h('input', { class: 'input num', type: 'number', value: (s.placementPoints || [5, 3, 1])[0] });
    const p2 = h('input', { class: 'input num', type: 'number', value: (s.placementPoints || [5, 3, 1])[1] });
    const p3 = h('input', { class: 'input num', type: 'number', value: (s.placementPoints || [5, 3, 1])[2] });
    const pa = h('input', { class: 'input num', type: 'number', value: s.attendancePoints ?? 1 });
    const pt = h('input', { class: 'input num', type: 'number', value: s.tipBonus ?? 3 });
    const pe = h('input', { class: 'input num', type: 'number', value: s.tipExactBonus ?? 5 });
    const setBtn = h('button', { class: 'btn ghost block', 'data-label': 'Wertung speichern' }, 'Wertung speichern');
    setBtn.addEventListener('click', async () => {
      const ok = await save('Wertung angepasst', (d) => {
        d.settings.placementPoints = [Number(p1.value) || 0, Number(p2.value) || 0, Number(p3.value) || 0];
        d.settings.attendancePoints = Number(pa.value) || 0;
        d.settings.tipBonus = Number(pt.value) || 0;
        d.settings.tipExactBonus = Number(pe.value) || 0;
      }, setBtn);
      if (ok) UI.toast('Wertung gilt ab sofort — auch rückwirkend.');
    });

    UI.clear(body).append(h('div', { class: 'section stack', style: 'padding-top:6px' },
      h('button', { class: 'small muted', style: 'text-align:left;background:none', onclick: homeView }, '← Zurück'),
      h('div', { class: 'card stack' },
        h('div', { class: 'eyebrow acid' }, 'DIE AFFEN'), plBox,
        h('div', { class: 'hstack' }, newName, addBtn)),
      h('div', { class: 'card stack' },
        h('div', { class: 'eyebrow acid' }, 'SAISONS'), seasonRows, newSeasonBtn,
        h('div', { class: 'small muted' }, 'Saisonwertung (Pokale wie 👑 und 🏮) zählt, sobald das Enddatum vorbei ist.')),
      h('div', { class: 'card stack' },
        h('div', { class: 'eyebrow acid' }, 'WERTUNG'),
        h('div', { style: 'display:grid;grid-template-columns:repeat(3,1fr);gap:8px' },
          h('div', { class: 'field' }, h('label', null, '1. Platz'), p1),
          h('div', { class: 'field' }, h('label', null, '2. Platz'), p2),
          h('div', { class: 'field' }, h('label', null, '3. Platz'), p3),
          h('div', { class: 'field' }, h('label', null, 'Antreten'), pa),
          h('div', { class: 'field' }, h('label', null, 'Tipp-Bonus'), pt),
          h('div', { class: 'field' }, h('label', null, 'Tipp exakt'), pe)),
        setBtn),
      h('div', { class: 'small muted center' },
        'Tokens verwaltet der Runden-Chef unter ', h('a', { href: 'admin.html', style: 'color:var(--acid)' }, 'admin.html'))));
    drawPlayers();
  }

  /* ---------- Einstieg ---------- */
  if (!session) { gateView(); return; }
  if (!API.isDemo()) {
    // Session noch gültig? (Token könnte deaktiviert worden sein)
    API.whoami(session.token).then((who) => {
      if (who.name !== session.name) { session.name = who.name; API.setSession(session); setWho(); }
    }).catch(() => { API.setSession(null); session = null; gateView(); });
  }
  if (params.get('view') === 'rsvp') nextView();
  else homeView();
})();
