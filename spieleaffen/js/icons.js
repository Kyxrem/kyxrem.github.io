/* SpieleAffen — icons.js
 *
 * Ein Icon-Primitive. Der Handoff rendert Material Symbols als Webfont und
 * schreibt dazu:
 *
 *   „Lucide was the first choice (closer to the brand's blunt line style), but
 *    per-glyph SVGs from unpkg/jsDelivr do not load in this preview
 *    environment … If icons can be self-hosted, swap in Lucide's SVGs and keep
 *    the same Icon API — the kebab aliases were named after Lucide slugs
 *    precisely so nothing else has to change."
 *
 * Genau das ist hier passiert. Die Symbole liegen als Pfade in dieser Datei:
 * kein fremder Host, kein Ladefenster, in dem statt eines Icons das Wort
 * „dashboard" im Layout steht — und die stumpfe Linienführung, die das
 * Design-System eigentlich wollte.
 *
 * Die API ist unverändert: Icon('flame', {size, color, label}). Aufrufstellen
 * benutzen Kebab-Aliase; die Material-Namen aus dem Handoff werden weiterhin
 * angenommen und übersetzt.
 *
 * Größen: 14 (dichte Zeilen) · 18 (Standard) · 22 (Buttons, Nav) · 32 (Leerzustände).
 * Nie über 32 skalieren. Icons sind dekorativ (aria-hidden), außer sie tragen
 * allein eine Bedeutung — dann `label` setzen.
 */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';

  /* Alle Pfade auf einem 24×24-Raster, Linienstärke 2, runde Enden — Lucide-Stil.
     Kurzformen: 'c x y r' = Kreis, 'r x y w h rx' = Rechteck, sonst Pfaddaten. */
  var ICONS = {
    'layout-dashboard': ['r 3 3 7 9 1', 'r 14 3 7 5 1', 'r 14 12 7 9 1', 'r 3 16 7 5 1'],
    flame: ['M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z'],
    users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'c 9 7 4', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
    trophy: ['M6 9H4.5a2.5 2.5 0 0 1 0-5H6', 'M18 9h1.5a2.5 2.5 0 0 0 0-5H18', 'M4 22h16',
      'M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22', 'M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22',
      'M18 2H6v7a6 6 0 0 0 12 0V2z'],
    dices: ['r 2 10 10 10 2', 'm17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6',
      'M6 18h.01', 'M10 14h.01', 'M15 6h.01', 'M18 9h.01'],
    extension: ['M9 3a2 2 0 0 1 4 0v1h4a1 1 0 0 1 1 1v4h1a2 2 0 0 1 0 4h-1v4a1 1 0 0 1-1 1h-4v-1a2 2 0 0 0-4 0v1H5a1 1 0 0 1-1-1v-4H3a2 2 0 0 1 0-4h1V5a1 1 0 0 1 1-1h4z'],
    shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'],
    'shield-user': ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'c 12 10 2.2', 'M8.6 17.2a4 4 0 0 1 6.8 0'],

    plus: ['M5 12h14', 'M12 5v14'],
    minus: ['M5 12h14'],
    x: ['M18 6 6 18', 'm6 6 12 12'],
    check: ['M20 6 9 17l-5-5'],
    'chevron-down': ['m6 9 6 6 6-6'],
    'chevron-right': ['m9 18 6-6-6-6'],
    'arrow-right': ['M5 12h14', 'm12 5 7 7-7 7'],
    'arrow-up': ['M12 19V5', 'm5 12 7-7 7 7'],
    'arrow-down': ['M12 5v14', 'm19 12-7 7-7-7'],
    'trending-up': ['M16 7h6v6', 'm22 7-8.5 8.5-5-5L2 17'],
    'trending-down': ['M16 17h6v-6', 'm22 17-8.5-8.5-5 5L2 7'],
    ellipsis: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],

    'calendar-days': ['r 3 4 18 18 2', 'M8 2v4', 'M16 2v4', 'M3 10h18',
      'M8 14h.01', 'M12 14h.01', 'M16 14h.01', 'M8 18h.01', 'M12 18h.01'],
    clock: ['c 12 12 10', 'M12 6v6l4 2'],
    history: ['M3 12a9 9 0 1 0 3-6.7L3 8', 'M3 3v5h5', 'M12 7v5l3.5 2'],

    skull: ['M12 2a8 8 0 0 0-8 8c0 2.5 1.2 4.3 2.5 5.3.3.2.5.6.5 1V18a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-1.7c0-.4.2-.8.5-1C18.8 14.3 20 12.5 20 10a8 8 0 0 0-8-8z',
      'c 9.2 10.5 1.6', 'c 14.8 10.5 1.6', 'M10 20v-3', 'M14 20v-3'],
    crown: ['m2.5 6.5 4.3 3.7a1 1 0 0 0 1.5-.3L11.6 4a.5.5 0 0 1 .88 0l3.3 5.9a1 1 0 0 0 1.5.3l4.3-3.7a.5.5 0 0 1 .8.52l-2.8 10.2a1 1 0 0 1-.96.74H5.8a1 1 0 0 1-.96-.74L1.7 7.02a.5.5 0 0 1 .8-.52z', 'M5 21h14'],
    pencil: ['M21.2 6.8a1 1 0 0 0-4-4L3.8 16.2a2 2 0 0 0-.5.83l-1.3 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z', 'm15 5 4 4'],
    'edit-note': ['M4 7h11', 'M4 12h7', 'M4 17h5', 'm19.8 11.2-6 6-3 .8.8-3 6-6a1.6 1.6 0 0 1 2.2 2.2z'],
    'user-plus': ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'c 9 7 4', 'M19 8v6', 'M22 11h-6'],
    archive: ['r 2 3 20 5 1', 'M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8', 'M10 12h4'],
    undo: ['M3 7v6h6', 'M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13'],

    lock: ['r 3 11 18 11 2', 'M7 11V7a5 5 0 0 1 10 0v4'],
    'lock-open': ['r 3 11 18 11 2', 'M7 11V7a5 5 0 0 1 9.9-1'],
    key: ['c 7.5 15.5 5.5', 'm11.4 11.6 9.6-9.6', 'm15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4'],
    'key-off': ['c 7.5 15.5 5.5', 'm11.4 11.6 9.6-9.6', 'm2 2 20 20'],
    logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'm16 17 5-5-5-5', 'M21 12H9'],

    play: ['m7 4 12 8-12 8V4z'],
    'stop-circle': ['c 12 12 10', 'r 9 9 6 6 1'],
    refresh: ['M3 12a9 9 0 0 1 9-9 9.7 9.7 0 0 1 6.7 2.7L21 8', 'M21 3v5h-5',
      'M21 12a9 9 0 0 1-9 9 9.7 9.7 0 0 1-6.7-2.7L3 16', 'M3 21v-5h5'],
    search: ['c 11 11 8', 'm21 21-4.3-4.3'],
    'cloud-off': ['m2 2 20 20', 'M5.8 5.8A6 6 0 0 0 6 18h11a4 4 0 0 0 1.9-.5', 'M9.5 5.3A6 6 0 0 1 20 10a4 4 0 0 1 1.6 7.2'],
    flask: ['M10 2v7.5L4.6 18a2 2 0 0 0 1.7 3h11.4a2 2 0 0 0 1.7-3L14 9.5V2', 'M8.5 2h7', 'M7 15h10'],
    loader: ['M12 2a10 10 0 0 1 10 10'],
    info: ['c 12 12 10', 'M12 16v-4', 'M12 8h.01'],
    message: ['M7.9 20A9 9 0 1 0 4 16.1L2 22z'],
    'party-popper': ['M5.8 11.3 2 22l10.7-3.8', 'M11 13c1.9 1.9 2.8 4.2 2 5-.8.8-3.1-.1-5-2s-2.8-4.2-2-5c.8-.8 3.1.1 5 2z',
      'M15 2h.01', 'M22 8h.01', 'M22 20h.01', 'm17 6 1.5-1.5', 'm19 13 1.8-.6'],

    /* Pokale */
    repeat: ['m17 2 4 4-4 4', 'M3 11v-1a4 4 0 0 1 4-4h14', 'm7 22-4-4 4-4', 'M21 13v1a4 4 0 0 1-4 4H3'],
    eye: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z', 'c 12 12 3'],
    target: ['c 12 12 10', 'c 12 12 6', 'c 12 12 2'],
    compass: ['c 12 12 10', 'm16.2 7.8-2.1 6.4-6.4 2.1 2.1-6.4z'],
    mountain: ['m8 3 4 8 5-5 5 15H2z'],
    scoreboard: ['r 3 4 18 16 2', 'M3 10h18', 'M12 10v10', 'M7 15h.01', 'M17 15h.01'],
    rocket: ['M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9 0z',
      'm12 15-3-3a22 22 0 0 1 2-4A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22 22 0 0 1-4 2z',
      'M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0', 'M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5'],
    medal: ['c 12 8 6', 'm8.5 13.5-1.5 8 5-3 5 3-1.5-8'],
    gavel: ['m14.5 12.5-8 8a2.1 2.1 0 1 1-3-3l8-8', 'm16 16 5-5', 'm8 8 5-5', 'm9 7 8 8', 'm20 11-7-7']
  };

  /* Material-Namen aus dem Handoff und die Kebab-Aliase aus Icon.jsx —
     beide zeigen auf denselben Pfadsatz, damit keine Aufrufstelle sich ändern muss. */
  var ALIAS = {
    dashboard: 'layout-dashboard', casino: 'dices', local_fire_department: 'flame',
    emoji_events: 'trophy', workspace_premium: 'crown', dangerous: 'skull',
    group: 'users', person_add: 'user-plus', calendar_month: 'calendar-days',
    schedule: 'clock', add: 'plus', remove: 'minus', close: 'x',
    expand_more: 'chevron-down', chevron_right: 'chevron-right', edit: 'pencil',
    play_arrow: 'play', more_horiz: 'ellipsis', progress_activity: 'loader',
    celebration: 'party-popper', arrow_upward: 'arrow-up', arrow_downward: 'arrow-down',
    trending_up: 'trending-up', trending_down: 'trending-down',
    admin_panel_settings: 'shield-user', edit_note: 'edit-note', lock_open: 'lock-open',
    lock_reset: 'key-off', restart_alt: 'refresh', stop_circle: 'stop-circle',
    cloud_off: 'cloud-off', science: 'flask', visibility: 'eye', gps_fixed: 'target',
    explore: 'compass', landscape: 'mountain', rocket_launch: 'rocket',
    military_tech: 'medal', chat_bubble: 'message', banana: 'party-popper',
    zap: 'flame', 'party-popper': 'party-popper'
  };

  function el(tag, attrs) {
    var node = document.createElementNS(NS, tag);
    Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    return node;
  }

  function shape(spec) {
    var teile = String(spec).split(' ');
    if (teile[0] === 'c') return el('circle', { cx: teile[1], cy: teile[2], r: teile[3] });
    if (teile[0] === 'r') return el('rect', { x: teile[1], y: teile[2], width: teile[3], height: teile[4], rx: teile[5] || 0 });
    return el('path', { d: spec });
  }

  /* opts: {size, color, label, class, style} */
  function Icon(name, opts) {
    opts = opts || {};
    var size = opts.size || 18;
    var key = ICONS[name] ? name : (ALIAS[name] && ICONS[ALIAS[name]] ? ALIAS[name] : null);
    var pfade = key ? ICONS[key] : ['c 12 12 3'];   // Unbekanntes wird ein Punkt, nie ein Wort.

    var svg = el('svg', {
      viewBox: '0 0 24 24', width: size, height: size,
      fill: 'none', stroke: 'currentColor',
      'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      class: 'sa-icon' + (opts.class ? ' ' + opts.class : ''),
      focusable: 'false',
      role: opts.label ? 'img' : 'presentation',
      'aria-hidden': opts.label ? 'false' : 'true'
    });
    if (opts.label) {
      var t = el('title', {});
      t.textContent = opts.label;
      svg.appendChild(t);
      svg.setAttribute('aria-label', opts.label);
    }
    if (opts.color) svg.style.color = opts.color;
    if (opts.style) Object.keys(opts.style).forEach(function (k) { svg.style[k] = opts.style[k]; });
    pfade.forEach(function (p) { svg.appendChild(shape(p)); });
    return svg;
  }

  window.SA_ICON = { Icon: Icon, ICONS: ICONS, ALIAS: ALIAS };
  window.Icon = Icon;
})();
