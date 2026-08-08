/* Affen: Spielerprofile. */
(async function () {
  'use strict';
  const { h } = UI;
  const app = UI.qs('#app');
  UI.tabbar('affen');

  let data;
  try { data = await API.loadData(); }
  catch (e) { UI.fail(app, e); return; }
  const ctx = Engine.prepare(data);
  const achievements = Engine.achievements(ctx);

  app.append(Render.pagehead(ctx, 'Die Affen'));
  UI.demoBanner(app);

  const players = data.players.filter((p) => p.active !== false);
  if (!players.length) {
    app.append(h('div', { class: 'empty' }, h('div', { class: 'big' }, '🐒'),
      h('h3', null, 'Keine Affen angelegt'),
      h('p', null, 'Leg unter Eintragen → Verwaltung die Runde an.')));
    return;
  }
  const params = new URLSearchParams(location.search);
  let cur = players.find((p) => p.id === params.get('p')) || players[0];

  const chips = h('div', { class: 'chips' });
  const box = h('div');

  function drawChips() {
    UI.clear(chips).append(...players.map((p) =>
      h('button', { class: 'chip' + (p.id === cur.id ? ' on' : ''), onclick: () => { cur = p; drawChips(); draw(); } },
        p.monkey + ' ' + p.name)));
  }

  function draw() {
    UI.clear(box);
    const pid = cur.id;
    const all = ctx.tables.all.find((r) => r.playerId === pid);
    const season = Engine.activeSeason(data);
    const sRow = season ? (ctx.tables[season.id] || []).find((r) => r.playerId === pid) : null;
    const sRows = season ? ctx.tables[season.id] || [] : [];

    if (!all) {
      box.append(h('div', { class: 'empty' }, h('div', { class: 'big' }, cur.monkey || '🐒'),
        h('h3', null, cur.name + ' hat noch nicht gespielt'),
        h('p', null, 'Kein Abend, keine Daten, keine Ausreden.')));
      return;
    }

    /* Kopf */
    const streak = ctx.streaks[pid]; const drought = ctx.droughts[pid];
    let tagline = null;
    const t = Engine.playerTag(ctx, pid, sRows.length ? sRows : ctx.tables.all);
    if (t) tagline = h('div', { class: 'eyebrow ' + (t.tone || ''), style: 'margin-top:7px' }, t.text);
    box.append(h('div', { class: 'section' },
      h('div', { class: 'card hstack', style: 'gap:14px' },
        h('div', { class: 'ava lg' }, cur.monkey || Engine.initials(cur.name)),
        h('div', { class: 'grow' },
          h('div', { style: 'font:600 20px/1.1 var(--sys)' }, cur.name),
          sRow ? h('div', { class: 'small muted', style: 'margin-top:4px' },
            'Platz ' + sRow.rank + ' in der Saison · Platz ' + all.rank + ' ewig') :
            h('div', { class: 'small muted', style: 'margin-top:4px' }, 'Platz ' + all.rank + ' in der ewigen Tabelle'),
          tagline))));

    /* Kacheln */
    const tiles = [
      { v: sRow ? sRow.pts : all.pts, label: sRow ? 'Punkte (Saison)' : 'Punkte (ewig)', tone: 'acid' },
      { v: all.wins, label: 'Abendsiege', sub: all.evenings + ' Abende' },
      { v: all.gameWins, label: 'Spielsiege' },
      { v: all.tipBonuses, label: 'Tipp-Boni' }
    ];
    box.append(h('div', { class: 'section' },
      h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px' },
        tiles.map((tt) => h('div', { class: 'tile' },
          h('b', { class: tt.tone || '' }, String(tt.v)),
          h('div', { class: 'tt' }, tt.label),
          tt.sub ? h('div', { class: 'td' }, tt.sub) : null)))));

    /* Form: letzte 5 besuchte Abende */
    const attended = ctx.evenings.filter((e) => e.stats.attendees.includes(pid));
    const last5 = attended.slice(-5);
    if (last5.length) {
      box.append(h('div', null,
        h('div', { class: 'sectionhead' }, h('div', { class: 'eyebrow' }, 'Form · letzte Abende')),
        h('div', { class: 'section' },
          h('div', { class: 'card flat hstack', style: 'gap:8px;justify-content:space-between' },
            last5.map((e) => {
              const r = e.stats.ranking.find((x) => x.playerId === pid);
              const win = r.rank === 1;
              const worst = e.stats.lastIds.includes(pid);
              return h('div', { class: 'center', style: 'flex:1' },
                h('div', {
                  style: 'width:34px;height:34px;margin:0 auto;border-radius:100px;display:flex;align-items:center;justify-content:center;' +
                    'font:700 15px/1 var(--disp);' +
                    (win ? 'background:var(--acid);color:var(--ink)' :
                      worst ? 'background:var(--alert-18);color:var(--alert)' : 'background:rgba(255,255,255,.07);color:var(--text-55)')
                }, String(r.rank)),
                h('div', { class: 'small muted', style: 'font-size:9px;margin-top:5px' }, Engine.fmtShort(e.ev.date)));
            })),
          streak.cur >= 2 ? h('div', { class: 'small', style: 'color:var(--acid);padding:10px 4px 0' },
            '🔥 ' + streak.cur + ' Abendsiege in Folge') :
            drought.cur >= 3 ? h('div', { class: 'small', style: 'color:var(--alert);padding:10px 4px 0' },
              '🕳️ Ohne Abendsieg seit ' + drought.cur + ' Abenden') : null)));
    }

    /* Angstgegner */
    const nem = (function () {
      const pair = {};
      ctx.evenings.forEach((e) => e.stats.games.forEach(({ game, ranked }) => {
        const me = ranked.find((r) => r.playerId === pid);
        if (!me) return;
        ranked.forEach((o) => {
          if (o.playerId === pid || o.rank === me.rank) return;
          const K = o.playerId + '|' + game.name;
          const P = (pair[K] = pair[K] || { pid: o.playerId, game: game.name, n: 0, lost: 0 });
          P.n++; if (o.rank < me.rank) P.lost++;
        });
      }));
      let best = null;
      Object.values(pair).forEach((P) => {
        if (P.n >= 4 && P.lost / P.n >= 0.7 && (!best || P.lost / P.n * P.n > best.lost / best.n * best.n)) best = P;
      });
      return best;
    })();
    if (nem) {
      const o = Engine.player(data, nem.pid);
      box.append(h('div', { class: 'section' },
        h('div', { class: 'card' },
          h('div', { class: 'eyebrow alert' }, 'Angstgegner'),
          h('div', { class: 'hstack', style: 'gap:14px;margin-top:14px' },
            h('div', { class: 'ava md', style: 'background:var(--alert-18);border:1px solid rgba(255,107,74,.35)' }, o.monkey),
            h('div', { class: 'grow' },
              h('div', { style: 'font:600 15px/1.15 var(--sys)' }, o.name),
              h('div', { class: 'small muted', style: 'margin-top:3px' },
                'schlägt dich bei ' + nem.game + ' in ' + nem.lost + ' von ' + nem.n + ' Partien')),
            h('div', { style: 'text-align:right;flex:none' },
              h('div', { style: 'font:700 22px/1 var(--disp);color:var(--alert)' }, (nem.n - nem.lost) + ':' + nem.lost),
              h('div', { class: 'eyebrow', style: 'margin-top:4px' }, 'BILANZ'))))));
    }

    /* Pokale */
    const mine = achievements.filter((a) => a.holders.some((hd) => hd.playerId === pid));
    box.append(h('div', null,
      h('div', { class: 'sectionhead' },
        h('div', { class: 'eyebrow' }, 'Pokalschrank · ' + mine.length),
        h('a', { class: 'more', href: 'pokale.html' + (API.isDemo() ? '?demo' : '') }, 'Alle Pokale')),
      h('div', { class: 'section' },
        mine.length ? h('div', { class: 'card flat' },
          h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px' }, mine.map((a) => {
            const hd = a.holders.find((x) => x.playerId === pid);
            return h('div', { class: 'badge won', title: a.name + (hd.count > 1 ? ' ×' + hd.count : '') + ' — ' + a.desc }, a.icon);
          }))) :
          h('div', { class: 'card flat small muted' }, 'Der Schrank ist leer. Peinlich.'))));

    /* Beste Spiele */
    const games = Object.values(ctx.perGame)
      .map((G) => ({ G, P: G.per[pid] })).filter((x) => x.P)
      .sort((a, b) => b.P.wins - a.P.wins || b.P.plays - a.P.plays).slice(0, 5);
    if (games.length) {
      box.append(h('div', null,
        h('div', { class: 'sectionhead' }, h('div', { class: 'eyebrow' }, 'Spiele')),
        h('div', { class: 'section' },
          h('div', { class: 'card flat' }, games.map(({ G, P }) =>
            h('div', { class: 'mini' },
              h('div', { class: 'nm', style: 'flex:1.6' }, G.name),
              h('div', { class: 'sc', style: 'color:var(--text-40)' }, P.wins + '/' + P.plays + ' Siege'),
              h('div', { class: 'sc win', style: 'width:44px;text-align:right' }, 'Best ' + P.best)))))));
    }
  }

  drawChips(); draw();
  app.append(chips, box);
})();
