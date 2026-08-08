/* Pokale: Achievements — freigeschaltet vs. offen, Zählstand pro Affe. */
(async function () {
  'use strict';
  const { h } = UI;
  const app = UI.qs('#app');
  UI.tabbar('pokale');

  let data;
  try { data = await API.loadData(); }
  catch (e) { UI.fail(app, e); return; }
  const ctx = Engine.prepare(data);
  const achievements = Engine.achievements(ctx);

  app.append(Render.pagehead(ctx, 'Pokale'));
  UI.demoBanner(app);

  const unlocked = achievements.filter((a) => a.unlocks.length);
  const locked = achievements.filter((a) => !a.unlocks.length);

  /* Medaillenspiegel */
  const counts = data.players.map((p) => ({
    p, n: unlocked.reduce((s, a) => s + (a.holders.some((hh) => hh.playerId === p.id) ? 1 : 0), 0)
  })).sort((a, b) => b.n - a.n);
  if (unlocked.length) {
    app.append(h('div', { class: 'section' },
      h('div', { class: 'card flat' },
        h('div', { class: 'eyebrow', style: 'margin-bottom:12px' }, 'Medaillenspiegel'),
        h('div', { style: 'display:grid;grid-template-columns:repeat(3,1fr);gap:10px' },
          counts.map((c, i) => h('a', { class: 'hstack', style: 'gap:8px', href: 'spieler.html' + (API.isDemo() ? '?demo&' : '?') + 'p=' + c.p.id },
            UI.ava(c.p, i === 0 && c.n > 0 ? 'acid' : ''),
            h('div', null,
              h('div', { style: 'font:700 17px/1 var(--disp)' }, String(c.n)),
              h('div', { class: 'small muted', style: 'font-size:10px' }, c.p.name))))))));
  }

  function trophyRow(a, won) {
    const latest = a.unlocks[a.unlocks.length - 1];
    return h('div', { class: 'trophy' },
      h('div', { class: 'badge ' + (won ? 'won' : 'lock') }, a.icon),
      h('div', { class: 'grow' },
        h('div', { class: 'tt' }, a.name,
          won && a.unlocks.length > 1 ? h('span', { class: 'muted', style: 'font-weight:500' }, ' · ' + a.unlocks.length + '×') : null),
        h('div', { class: 'td' }, a.desc),
        won ? h('div', { class: 'holderchips' }, a.holders.map((hd) => {
          const p = Engine.player(data, hd.playerId);
          return h('span', { class: 'holderchip' }, p.monkey + ' ' + p.name + (hd.count > 1 ? ' ×' + hd.count : ''));
        })) : null,
        won && latest ? h('div', { class: 'small muted', style: 'margin-top:6px;font-size:10px' },
          'Zuletzt: ' + Engine.player(data, latest.playerId).name + ' · ' + Engine.fmtLong(latest.date) +
          (latest.detail ? ' · ' + latest.detail : '')) : null));
  }

  app.append(h('div', { class: 'sectionhead' },
    h('div', { class: 'eyebrow acid' }, 'Freigeschaltet · ' + unlocked.length),
    h('div', { class: 'eyebrow' }, 'Gesamt ' + achievements.length)));
  if (unlocked.length) {
    app.append(h('div', { class: 'section' },
      h('div', { class: 'card' }, unlocked.map((a) => trophyRow(a, true)))));
  } else {
    app.append(h('div', { class: 'empty' },
      h('div', { class: 'big' }, '🏆'),
      h('h3', null, 'Noch alles zu holen'),
      h('p', null, 'Kein Pokal vergeben. Der erste Abend ändert das sofort.')));
  }

  if (locked.length) {
    app.append(h('div', { class: 'sectionhead' }, h('div', { class: 'eyebrow' }, 'Noch offen · ' + locked.length)),
      h('div', { class: 'section' },
        h('div', { class: 'card', style: 'opacity:.85' }, locked.map((a) => trophyRow(a, false)))));
  }
})();
