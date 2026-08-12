/* SpieleAffen — shell.js
 * Die Schale aus ui_kits/dashboard/AppShell.jsx: Seitenleiste mit Wortmarke,
 * Navigation, Widget für den nächsten Abend — plus ScreenHead, die Toasts und
 * ein Wirt für Dialoge.
 *
 * Die Seitenleiste ist fest und immer sichtbar; darunter scrollt nichts weg.
 * Am Telefon wandert sie an den unteren Rand (siehe css/app.css).
 */
(function () {
  'use strict';
  var h = window.h, U = window.SA_UI, SA = window.SA, S = window.SA_STORE;

  var NAV = [
    { id: 'uebersicht', icon: 'layout-dashboard', label: 'Übersicht' },
    { id: 'abend', icon: 'flame', label: 'Abend läuft' },
    { id: 'affen', icon: 'users', label: 'Affen' },
    { id: 'rangliste', icon: 'trophy', label: 'Rangliste' },
    { id: 'spiele', icon: 'dices', label: 'Spiele' },
    { id: 'module', icon: 'extension', label: 'Spielmodule' },
    { id: 'admin', icon: 'admin_panel_settings', label: 'Admin' }
  ];

  function Wordmark() {
    return h('span.sa-wordmark', null, 'Spiele', h('em', 'Affen'));
  }

  /* Ein Kopf für jeden Screen: Augenbraue, Titel, Unterzeile, Aktionen. */
  function ScreenHead(o) {
    o = o || {};
    return h('header.sa-head', null,
      h('div.sa-head__text', null,
        o.eyebrow ? h('span.sa-head__eyebrow', o.eyebrow) : null,
        h('h1.sa-head__title', o.title),
        o.sub ? h('p.sa-head__sub', o.sub) : null),
      o.actions ? h('div.sa-head__actions', o.actions) : null
    );
  }

  // ── Dialoge ──────────────────────────────────────────────────────────────
  var overlayHost = null;

  function overlay(builder) {
    closeOverlay();
    overlayHost = builder(closeOverlay);
    document.body.appendChild(overlayHost);
    document.body.classList.add('sa-hat-overlay');
    document.addEventListener('keydown', escClose);
    var first = overlayHost.querySelector('input, select, button');
    if (first) setTimeout(function () { first.focus(); }, 30);
  }
  function closeOverlay() {
    if (overlayHost && overlayHost.parentNode) overlayHost.parentNode.removeChild(overlayHost);
    overlayHost = null;
    document.body.classList.remove('sa-hat-overlay');
    document.removeEventListener('keydown', escClose);
  }
  function escClose(e) { if (e.key === 'Escape') closeOverlay(); }

  // ── Toasts ───────────────────────────────────────────────────────────────
  /* Eigener Wirt außerhalb der Schale, damit ein Neuzeichnen die Meldungen
     nicht mitten in der Einblendung wegräumt. */
  var toastHost = null;
  function renderToasts(state) {
    if (!toastHost) {
      toastHost = h('div.sa-toasts');
      document.body.appendChild(toastHost);
    }
    toastHost.style.display = state.toasts.length ? '' : 'none';
    window.SA_DOM.mount(toastHost, state.toasts.map(function (t) {
      return U.Toast({
        title: t.title, message: t.message, tone: t.tone,
        onDismiss: function () { S.dismiss(t.id); }
      });
    }));
  }

  // ── Seitenleiste ─────────────────────────────────────────────────────────
  function Sidebar(state, c) {
    var affenCount = c.standings('all', { includeEmpty: true }).length;
    var badges = {
      abend: c.liveNight ? 'live' : null,
      affen: affenCount || null,
      spiele: c.shelf.length || null,
      module: 2,
      admin: state.me ? (state.me.admin ? 'Admin' : 'Du') : 'Code'
    };

    var next = c.nextNight;
    var meRow;
    if (state.me) {
      var meStanding = c.standings('all').filter(function (a) { return a.id === state.me.id; })[0];
      var mePlayer = c.playerById[state.me.id] || {};
      meRow = h('div.sa-me', null,
        U.PlayerAvatar({ name: state.me.name, seat: mePlayer.seat || 1, size: 'sm' }),
        h('span.sa-me__text', 'Du · ' + (meStanding ? 'Platz ' + meStanding.place : 'noch kein Abend')),
        U.IconButton({ icon: 'logout', label: 'Abmelden', size: 'sm', onClick: function () {
          S.logout().then(function () { S.toast('Abgemeldet', 'Der Code bleibt am Kühlschrank.', 'neutral'); });
        } })
      );
    } else {
      meRow = h('div.sa-me', null,
        U.Button({ children: 'Anmelden', size: 'sm', variant: 'secondary', fullWidth: true, iconLeft: 'lock_open',
          onClick: function () { S.navigate('admin'); } })
      );
    }

    return h('aside.sa-side', null,
      h('div.sa-side__brand', null, Wordmark()),
      h('nav.sa-nav', NAV.map(function (n) {
        return U.SidebarItem({
          icon: n.icon, label: n.label, badge: badges[n.id],
          active: state.view === n.id,
          onClick: function () { S.navigate(n.id); }
        });
      })),
      h('div.sa-side__foot', null,
        h('div.sa-conn', state.source === 'demo'
          ? U.Badge({ children: 'Demo', tone: 'punsch', size: 'sm', icon: 'science' })
          : state.source === 'cache'
            ? U.Badge({ children: 'Offline', tone: 'banana', size: 'sm', icon: 'cloud_off' })
            : U.Badge({ children: 'Live', tone: 'slime', size: 'sm', dot: true })),
        h('div.sa-nextnight', null,
          h('span.sa-nextnight__label', 'Nächster Abend'),
          h('span.sa-nextnight__date', next ? SA.fmtDateLong(next.date) : 'Noch nichts geplant'),
          U.Button({
            children: 'Abend planen', size: 'sm', fullWidth: true, iconLeft: 'plus',
            onClick: function () { window.SA_DIALOGS.abendPlanen(); }
          })),
        meRow)
    );
  }

  function render(root, state, opts) {
    if (opts && opts.nurToasts) { renderToasts(state); return; }
    var c = S.computed();
    var screen = window.SA_SCREENS[state.view] || window.SA_SCREENS.uebersicht;
    window.SA_DOM.mount(root,
      h('div.sa-shell', null,
        Sidebar(state, c),
        h('main.sa-main', { id: 'sa-main' }, screen(state, c))
      )
    );
    renderToasts(state);
  }

  window.SA_SHELL = {
    NAV: NAV, Wordmark: Wordmark, ScreenHead: ScreenHead,
    overlay: overlay, closeOverlay: closeOverlay, render: render
  };
})();
