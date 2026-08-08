/* SpieleAffen gemeinsame Render-Bausteine (read-only Seiten). */
(function (root) {
  'use strict';
  const { h } = UI;
  const R = {};

  R.editHref = () => 'edit.html' + (API.isDemo() ? '?demo' : '');

  R.seasonInfo = function (ctx) {
    const data = ctx.data;
    const s = Engine.activeSeason(data);
    const evs = ctx.evenings.filter((e) => s && e.ev.seasonId === s.id);
    let weeksLeft = null;
    if (s && s.end) {
      const ms = new Date(s.end) - new Date();
      weeksLeft = Math.max(0, Math.ceil(ms / (7 * 864e5)));
    }
    return { season: s, matchday: evs.length, weeksLeft };
  };

  R.pagehead = function (ctx, title) {
    const info = R.seasonInfo(ctx);
    const eyebrow = info.season ? (info.season.name + ' · ' + info.season.label).toUpperCase() : 'SPIELEAFFEN';
    const meta = [];
    if (info.matchday) meta.push('Spieltag ' + info.matchday);
    if (info.weeksLeft !== null && info.weeksLeft > 0) meta.push('noch ' + info.weeksLeft + (info.weeksLeft === 1 ? ' Woche' : ' Wochen'));
    return h('header', { class: 'pagehead' },
      h('div', null,
        h('div', { class: 'eyebrow acid' }, eyebrow),
        h('h1', null, title)),
      h('div', { class: 'meta', html: meta.join('<br>') }));
  };

  R.ticker = function (ctx) {
    const items = Engine.sticheleien(ctx);
    if (!items.length) return null;
    const s = items.join(' ✦ ') + ' ✦ ';
    return h('div', { class: 'ticker' }, h('div', { class: 'rail' }, s + s));
  };

  /* Tabelle (Saison/Ewig) */
  R.tableBlock = function (ctx, rows, opts = {}) {
    const data = ctx.data;
    const head = h('div', { class: 'tblhead' },
      h('div', null, '#'), h('div', null, 'Spieler'),
      h('div', null, 'Sp'), h('div', null, 'S'), h('div', null, 'Pkt'));
    const maxRank = rows.length ? rows[rows.length - 1].rank : 0;
    const body = h('div', { class: 'tbl' }, rows.map((r) => {
      const p = Engine.player(data, r.playerId);
      const lead = r.rank === 1 && rows.length > 1;
      const last = rows.length >= 4 && r.rank === maxRank && maxRank > 1;
      const tag = opts.tags === false ? null : Engine.playerTag(ctx, r.playerId, rows);
      return h('a', { class: 'row' + (lead ? ' lead' : '') + (last ? ' last' : ''), href: 'spieler.html' + (API.isDemo() ? '?demo&' : '?') + 'p=' + r.playerId },
        h('div', { class: 'rk' }, String(r.rank)),
        h('div', { class: 'who' },
          UI.ava(p, lead ? 'acid' : ''),
          h('div', { style: 'min-width:0' },
            h('div', { class: 'name' }, p.name),
            tag ? h('div', { class: 'tag ' + tag.tone }, tag.text) : null)),
        h('div', { class: 'c' }, String(r.evenings)),
        h('div', { class: 'c' }, String(r.wins)),
        h('div', { class: 'pts' }, String(r.pts)));
    }));
    return h('div', null, head, body);
  };

  /* Pro-Spiel-Tabelle */
  R.perGameBlock = function (ctx) {
    const games = Object.values(ctx.perGame).sort((a, b) => b.plays - a.plays);
    if (!games.length) return h('div', { class: 'empty' }, h('p', null, 'Noch keine Spiele erfasst.'));
    const wrap = h('div');
    const sel = h('select', { class: 'input', style: 'margin:0 20px 14px; width:calc(100% - 40px)' },
      games.map((g) => h('option', { value: g.name }, g.name + ' · ' + g.plays + '×')));
    function draw(name) {
      const G = games.find((g) => g.name === name);
      const rows = Object.values(G.per).sort((a, b) => b.wins - a.wins ||
        (G.lowWins ? a.best - b.best : b.best - a.best));
      const head = h('div', { class: 'tblhead' },
        h('div', null, '#'), h('div', null, 'Spieler'),
        h('div', null, 'Sp'), h('div', null, 'S'), h('div', null, 'Best'));
      const tbl = h('div', { class: 'tbl' }, rows.map((r, i) => {
        const p = Engine.player(ctx.data, r.playerId);
        return h('div', { class: 'row' + (i === 0 && r.wins > 0 ? ' lead' : '') },
          h('div', { class: 'rk' }, String(i + 1)),
          h('div', { class: 'who' }, UI.ava(p, i === 0 && r.wins > 0 ? 'acid' : ''),
            h('div', null, h('div', { class: 'name' }, p.name))),
          h('div', { class: 'c' }, String(r.plays)),
          h('div', { class: 'c' }, String(r.wins)),
          h('div', { class: 'pts' }, String(r.best)));
      }));
      const info = h('div', { class: 'small muted', style: 'padding:8px 20px 0' },
        G.lowWins ? 'Weniger ist mehr — Bestwert ist der niedrigste Score.' : '');
      UI.clear(box).append(head, tbl, info);
    }
    const box = h('div');
    sel.addEventListener('change', () => draw(sel.value));
    wrap.append(sel, box);
    draw(games[0].name);
    return wrap;
  };

  /* Nächster Abend */
  R.nextCard = function (ctx) {
    const nx = ctx.data.next;
    if (!nx || !nx.date) return null;
    const host = nx.hostId ? Engine.player(ctx.data, nx.hostId) : null;
    const day = Engine.fmtDay(nx.date);
    const yes = Object.values(nx.rsvp || {}).filter((v) => v === 'yes').length;
    return h('div', null,
      h('div', { class: 'sectionhead' },
        h('div', { class: 'eyebrow' }, 'Nächster Abend'),
        yes ? h('div', { class: 'more' }, yes + ' zugesagt') : null),
      h('div', { class: 'section' },
        h('div', { class: 'card flat hstack', style: 'gap:14px' },
          h('div', { class: 'datebox' }, h('b', null, day.d), h('span', null, day.mon)),
          h('div', { class: 'vline' }),
          h('div', { class: 'grow' },
            h('div', { style: 'font:600 13.5px/1.2 var(--sys)' },
              (host ? 'Bei ' + host.name : 'Ort offen') + (nx.time ? ' · ' + nx.time : '')),
            nx.plan ? h('div', { class: 'small muted mt6' }, nx.plan) : null),
          h('a', { class: 'btn pill', href: R.editHref() + (API.isDemo() ? '&' : '?') + 'view=rsvp', style: 'flex:none' }, 'Bin da'))));
  };

  /* Abend-Karte (letzter Abend / Liste). full=true zeigt alle Spieler + Spiele-Details */
  R.eveningCard = function (ctx, e, opts = {}) {
    const data = ctx.data;
    const games = e.ev.games || [];
    const title = games.map((g) => g.name).join(' + ') || 'Abend';
    const minutes = games.reduce((s, g) => s + (g.minutes || 0), 0);
    const host = e.ev.hostId ? Engine.player(data, e.ev.hostId) : null;
    const ranking = opts.full ? e.stats.ranking : e.stats.ranking.slice(0, 3);

    const rows = ranking.map((r) => {
      const p = Engine.player(data, r.playerId);
      const win = r.rank === 1;
      return h('div', { class: 'mini' },
        h('div', { class: 'rk' + (win ? ' win' : '') }, String(r.rank)),
        h('div', { class: 'nm' + (win ? ' win' : '') }, p.monkey + ' ' + p.name),
        h('div', { class: 'sc' + (win ? ' win' : '') }, r.pts + ' P'));
    });

    let banter = null;
    let flop = null;
    e.stats.games.forEach(({ game, tipEval }) => Object.entries(tipEval.per).forEach(([pid, te]) => {
      if (te.tip > te.score && (!flop || te.err > flop.err)) flop = { pid, ...te, game: game.name };
    }));
    if (flop && flop.err >= 3) {
      banter = h('div', { class: 'banterline' },
        Engine.player(data, flop.pid).name + ' tippte ' + flop.tip + ', holte ' + flop.score + '. ',
        h('b', null, 'Größte Selbstüberschätzung des Abends.'));
    } else {
      let seher = null;
      e.stats.games.forEach(({ game, tipEval }) => Object.entries(tipEval.per).forEach(([pid, te]) => {
        if (te.err === 0) seher = { pid, game: game.name, tip: te.tip };
      }));
      if (seher) banter = h('div', { class: 'banterline' },
        Engine.player(data, seher.pid).name + ' sagte bei ' + seher.game + ' exakt ' + seher.tip + ' voraus. ',
        h('b', null, 'Hellseher.'));
    }

    const detail = [];
    if (opts.full) {
      e.stats.games.forEach(({ game, ranked, tipEval }) => {
        detail.push(h('div', { class: 'mt14' },
          h('div', { class: 'between' },
            h('div', { style: 'font:600 12.5px/1 var(--sys)' }, game.name + (game.lowWins ? ' ↓' : '')),
            h('div', { class: 'eyebrow' }, (game.minutes ? game.minutes + ' MIN' : ''))),
          h('div', { class: 'mt6' }, ranked.map((r) => {
            const p = Engine.player(data, r.playerId);
            const te = tipEval.per[r.playerId];
            return h('div', { class: 'mini' },
              h('div', { class: 'rk' + (r.rank === 1 ? ' win' : '') }, String(r.rank)),
              h('div', { class: 'nm' + (r.rank === 1 ? ' win' : '') }, p.name,
                te ? h('span', { class: 'muted', style: 'font-size:10px' },
                  '  · Tipp ' + te.tip + (te.bonus ? ' (+' + te.bonus + ')' : '')) : null),
              h('div', { class: 'sc' + (r.rank === 1 ? ' win' : '') }, String(r.score)));
          }))));
      });
    }

    return h('div', { class: 'card flat' },
      h('div', { class: 'between', style: 'margin-bottom:12px' },
        h('div', null,
          h('div', { style: 'font:600 13.5px/1.2 var(--sys)' }, title),
          opts.subtitle !== false ? h('div', { class: 'small muted mt6' },
            Engine.fmtFull(e.ev.date) + (host ? ' · bei ' + host.name : '') + ' · Spieltag ' + e.matchday) : null),
        h('div', { class: 'eyebrow', style: 'text-align:right' },
          e.stats.attendees.length + ' SPIELER' + (minutes ? ' · ' + minutes + ' MIN' : ''))),
      h('div', { class: 'stack', style: 'gap:7px' }, rows),
      detail,
      banter);
  };

  /* Frisch freigeschaltete Pokale */
  R.freshUnlocks = function (ctx, achievements, n) {
    const feed = Engine.unlockFeed(achievements).slice(0, n || 2);
    if (!feed.length) return null;
    const total = achievements.reduce((s, a) => s + (a.unlocks.length ? 1 : 0), 0);
    return h('div', null,
      h('div', { class: 'sectionhead' },
        h('div', { class: 'eyebrow' }, 'Frisch freigeschaltet'),
        h('a', { class: 'more', href: 'pokale.html' + (API.isDemo() ? '?demo' : '') }, 'Alle ' + total)),
      h('div', { class: 'section' },
        h('div', { class: 'card' },
          h('div', { class: 'stack', style: 'gap:13px' }, feed.map((u) =>
            h('div', { class: 'hstack', style: 'gap:12px' },
              h('div', { class: 'badge won' }, u.icon),
              h('div', { class: 'grow' },
                h('div', { style: 'font:600 12.5px/1.2 var(--sys)' }, u.name),
                h('div', { class: 'small muted', style: 'margin-top:3px' },
                  Engine.player(ctx.data, u.playerId).name + ' · ' + (u.detail || Engine.fmtLong(u.date))))))))));
  };

  /* Rekord-Tiles */
  R.recordTiles = function (ctx) {
    const recs = Engine.records(ctx);
    if (!recs.length) return null;
    return h('div', null,
      h('div', { class: 'sectionhead' }, h('div', { class: 'eyebrow' }, 'Rekorde der Runde')),
      h('div', { class: 'section' },
        h('div', { class: 'tiles scroll' }, recs.map((r) =>
          h('div', { class: 'tile fix' },
            h('b', { class: r.tone || '' }, String(r.v)),
            h('div', { class: 'tt' }, r.label),
            h('div', { class: 'td' }, r.sub))))));
  };

  root.Render = R;
})(window);
