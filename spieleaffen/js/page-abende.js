/* Abende: alle Spieltage je Saison, aufklappbare Details. */
(async function () {
  'use strict';
  const { h } = UI;
  const app = UI.qs('#app');
  UI.tabbar('abende');

  let data;
  try { data = await API.loadData(); }
  catch (e) { UI.fail(app, e); return; }
  const ctx = Engine.prepare(data);

  app.append(Render.pagehead(ctx, 'Abende'));
  UI.demoBanner(app);

  if (!ctx.evenings.length) {
    app.append(h('div', { class: 'empty' },
      h('div', { class: 'big' }, '🎲'),
      h('h3', null, 'Noch nichts gespielt?'),
      h('p', null, 'Trag den ersten Abend ein, dann beginnt hier die Chronik.'),
      h('a', { class: 'btn', style: 'margin-top:16px', href: Render.editHref() }, 'Abend eintragen')));
    return;
  }

  const seasonsWithEv = data.seasons.filter((s) => ctx.evenings.some((e) => e.ev.seasonId === s.id)).reverse();
  let cur = Engine.activeSeason(data);
  if (!cur || !ctx.evenings.some((e) => e.ev.seasonId === cur.id)) cur = seasonsWithEv[0];

  const chips = h('div', { class: 'chips' });
  const listBox = h('div', { class: 'section stack' });

  function drawChips() {
    UI.clear(chips).append(...seasonsWithEv.map((s) =>
      h('button', { class: 'chip' + (s.id === cur.id ? ' on' : ''), onclick: () => { cur = s; drawChips(); drawList(); } }, s.name)));
  }
  function drawList() {
    const evs = ctx.evenings.filter((e) => e.ev.seasonId === cur.id).slice().reverse();
    UI.clear(listBox).append(...evs.map((e) => {
      const box = h('div');
      let full = false;
      function draw() {
        const card = Render.eveningCard(ctx, e, { full });
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => { full = !full; draw(); });
        UI.clear(box).append(card);
      }
      draw();
      return box;
    }));
  }
  drawChips(); drawList();
  app.append(chips, listBox,
    h('div', { class: 'small muted center', style: 'padding:10px 20px 0' }, 'Tippen für Spiel-Details'));
})();
