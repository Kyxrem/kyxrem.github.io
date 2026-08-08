/* Start: Hero, Ticker, Tabelle, nächster/letzter Abend, Pokale, Rekorde. */
(async function () {
  'use strict';
  const { h } = UI;
  const app = UI.qs('#app');
  UI.tabbar('start');

  let data;
  try { data = await API.loadData(); }
  catch (e) { UI.fail(app, e); return; }
  const ctx = Engine.prepare(data);
  const achievements = Engine.achievements(ctx);
  const info = Render.seasonInfo(ctx);

  app.append(Render.pagehead(ctx, 'SpieleAffen'));
  UI.demoBanner(app);

  const ticker = Render.ticker(ctx);
  if (ticker) app.append(ticker);

  const seasonRows = info.season ? ctx.tables[info.season.id] || [] : [];

  /* Hero: Spitzenreiter der laufenden Saison */
  if (seasonRows.length) {
    const top = seasonRows[0];
    const p = Engine.player(data, top.playerId);
    const gap = seasonRows[1] ? top.pts - seasonRows[1].pts : null;
    const streak = ctx.streaks[top.playerId];
    let line = 'Führt die Tabelle an. Noch.';
    if (streak && streak.cur >= 2) line = streak.cur + ' Abende in Folge gewonnen. Es wird langsam unangenehm.';
    else if (gap !== null && gap >= 8) line = 'Vorsprung: ' + gap + ' Punkte. Da hilft nur noch Sabotage.';
    else if (gap !== null && gap <= 3) line = 'Nur ' + gap + ' Punkte Vorsprung. Es riecht nach Wachablösung.';
    app.append(h('div', { class: 'section' },
      h('div', { class: 'hero' },
        h('div', { class: 'ghost' }, '1'),
        h('div', { style: 'position:relative' },
          h('div', { class: 'eyebrow' }, 'SPITZENREITER'),
          h('h2', null, p.name),
          h('p', null, line),
          h('div', { class: 'stats' },
            h('div', null, h('b', null, String(top.pts)), h('span', null, 'PUNKTE')),
            h('div', null, h('b', null, String(top.wins)), h('span', null, 'SIEGE')),
            gap !== null ? h('div', null, h('b', null, '+' + gap), h('span', null, 'VORSPRUNG')) : null)))));
  }

  /* Tabelle mit Chips */
  const tblBox = h('div');
  const chips = h('div', { class: 'chips' });
  const modes = [
    { id: 'saison', label: 'Saison', avail: !!info.season },
    { id: 'ewig', label: 'Ewig', avail: true },
    { id: 'prospiel', label: 'Pro Spiel', avail: true }
  ].filter((m) => m.avail);
  let mode = modes[0].id;
  function drawChips() {
    UI.clear(chips).append(...modes.map((m) =>
      h('button', { class: 'chip' + (m.id === mode ? ' on' : ''), onclick: () => { mode = m.id; drawChips(); drawTable(); } }, m.label)));
  }
  function drawTable() {
    UI.clear(tblBox);
    if (mode === 'saison') tblBox.append(Render.tableBlock(ctx, seasonRows));
    else if (mode === 'ewig') tblBox.append(Render.tableBlock(ctx, ctx.tables.all, { tags: false }));
    else tblBox.append(Render.perGameBlock(ctx));
    if ((mode === 'saison' && !seasonRows.length) || (mode === 'ewig' && !ctx.tables.all.length)) {
      UI.clear(tblBox).append(h('div', { class: 'empty' },
        h('div', { class: 'big' }, '🐒'),
        h('h3', null, 'Noch keine Abende'),
        h('p', null, 'Sobald der erste Abend eingetragen ist, steht hier die Tabelle.'),
        h('a', { class: 'btn mt14', style: 'margin-top:16px', href: Render.editHref() }, 'Ersten Abend eintragen')));
    }
  }
  drawChips(); drawTable();
  app.append(chips, tblBox, h('hr', { class: 'hr' }));

  const next = Render.nextCard(ctx);
  if (next) app.append(next);

  const last = ctx.evenings[ctx.evenings.length - 1];
  if (last) {
    app.append(h('div', null,
      h('div', { class: 'sectionhead' },
        h('div', { class: 'eyebrow' }, 'Letzter Abend · ' + Engine.fmtLong(last.ev.date)),
        h('a', { class: 'more', href: 'abende.html' + (API.isDemo() ? '?demo' : '') }, 'Alle Abende')),
      h('div', { class: 'section' }, Render.eveningCard(ctx, last, { subtitle: false }))));
  }

  const fresh = Render.freshUnlocks(ctx, achievements, 2);
  if (fresh) app.append(fresh);
  const recs = Render.recordTiles(ctx);
  if (recs && ctx.evenings.length) app.append(recs);
})();
