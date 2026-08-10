/* SpieleAffen — ui.js: gemeinsame Render-Helfer (Hauptseite + Editor). */
(function () {
  'use strict';
  var SA = window.SA;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function avatar(player, opts) {
    opts = opts || {};
    var cls = 'avatar' + (opts.acid ? ' acid' : '') + (opts.lg ? ' lg' : '');
    return '<div class="' + cls + '">' + esc(SA.shortCode(player)) + '</div>';
  }

  function el(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }

  function toast(msg, isErr) {
    var old = document.querySelector('.toast');
    if (old) old.remove();
    var t = el('<div class="toast' + (isErr ? ' err' : '') + '">' + esc(msg) + '</div>');
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, isErr ? 4200 : 2400);
  }

  // Ergebniszeilen eines Spiels (Abend-Karten, überall gleich)
  function gameResultRows(computed, game, opts) {
    opts = opts || {};
    var gv = SA.evalGame(game);
    var rows = Object.keys(gv).map(function (pid) { return { pid: pid, r: gv[pid] }; });
    rows.sort(function (a, b) { return a.r.place - b.r.place || a.pid.localeCompare(b.pid); });
    if (opts.top) rows = rows.slice(0, opts.top);
    return rows.map(function (x) {
      var p = computed.playerById[x.pid];
      var tipHtml = '';
      if (x.r.tip !== null && x.r.tip !== undefined) {
        var hit = x.r.tipPts > 0;
        tipHtml = '<div class="tip' + (hit ? ' hit' : '') + '">TIPP ' + esc(x.r.tip) + (x.r.exact ? ' ✦' : '') + '</div>';
      }
      return '<div class="resrow' + (x.r.place === 1 ? ' first' : '') + '">' +
        '<div class="p">' + x.r.place + '</div>' +
        '<div class="n">' + esc(p ? p.name : x.pid) + '</div>' +
        tipHtml +
        '<div class="sc">' + esc(x.r.score) + ' SP</div>' +
      '</div>';
    }).join('');
  }

  function nightMeta(night) {
    var n = (night.games || []).length;
    var players = {};
    (night.games || []).forEach(function (g) {
      (g.results || []).forEach(function (r) { players[r.playerId] = true; });
    });
    var mins = 0;
    (night.games || []).forEach(function (g) { if (g.durationMin) mins += g.durationMin; });
    return {
      games: n,
      players: Object.keys(players).length,
      minutes: mins
    };
  }

  // Aufklappbare Abend-Karte (read-only Ansicht)
  function nightDetails(computed, info, opts) {
    opts = opts || {};
    var night = info.night, ev = info.eval;
    var meta = nightMeta(night);
    var host = night.hostId ? computed.playerById[night.hostId] : null;
    var winnerNames = ev.winners.map(function (pid) {
      return computed.playerById[pid] ? computed.playerById[pid].name : pid;
    }).join(' & ');
    var titles = (night.games || []).map(function (g) { return g.title; }).join(' · ');
    var banter = SA.banterForNight(computed, info);
    var banterHtml = banter.length
      ? '<div class="banter">' + esc(banter[0].plain) + ' <b>' + esc(banter[0].strong) + '</b></div>'
      : '';
    return '<details class="night-item"' + (opts.open ? ' open' : '') + '>' +
      '<summary>' +
        '<div class="date"><div class="d">' + SA.dayNum(night.date) + '</div><div class="m">' + esc(SA.monthAbbr(night.date)) + '</div></div>' +
        '<div class="info"><div class="t">' + esc(titles || 'Spieleabend') + '</div>' +
          '<div class="s">' + (host ? 'Bei ' + esc(host.name) + ' · ' : '') + meta.players + ' Spieler' + (meta.minutes ? ' · ' + meta.minutes + ' min' : '') + '</div></div>' +
        '<div class="win"><div class="n">' + esc(winnerNames) + '</div><div class="k">ABENDSIEG</div></div>' +
      '</summary>' +
      '<div class="night-body">' +
        (night.games || []).map(function (g) {
          return '<div class="game-block">' +
            '<div class="gh"><div class="gt">' + esc(g.title) + (g.lowerWins ? ' <span class="gm">(WENIGER GEWINNT)</span>' : '') + '</div>' +
            '<div class="gm">' + (g.durationMin ? g.durationMin + ' MIN' : '') + '</div></div>' +
            '<div class="reslist">' + gameResultRows(computed, g) + '</div>' +
          '</div>';
        }).join('') +
        banterHtml +
      '</div>' +
    '</details>';
  }

  window.SA_UI = {
    esc: esc,
    avatar: avatar,
    el: el,
    toast: toast,
    gameResultRows: gameResultRows,
    nightMeta: nightMeta,
    nightDetails: nightDetails
  };
})();
