/* SpieleAffen — icons.js
 * Portiert aus components/core/Icon.jsx.
 *
 * Ein Icon-Primitive: ein Material-Symbols-Glyph, in px bemessen, erbt currentColor.
 * Aufrufstellen benutzen Kebab-Aliase (nach Lucide-Slugs benannt) — jeder rohe
 * Material-Name funktioniert ebenfalls. Outlined immer, weight 400, fill nur
 * einmal pro Screen.
 *
 * Größen: 14 (dichte Zeilen) · 18 (Standard) · 22 (Buttons, Nav) · 32 (Empty States).
 * Nie über 32 skalieren. Icons sind dekorativ (aria-hidden), außer sie tragen
 * allein eine Bedeutung — dann `label` setzen.
 */
(function () {
  'use strict';
  var h = window.h;

  /* Aus Icon.jsx übernommen. */
  var ALIAS = {
    'layout-dashboard': 'dashboard', dices: 'casino', flame: 'local_fire_department', trophy: 'emoji_events',
    crown: 'workspace_premium', skull: 'dangerous', banana: 'restaurant', users: 'group', 'user-plus': 'person_add',
    'calendar-days': 'calendar_month', clock: 'schedule', plus: 'add', minus: 'remove', x: 'close',
    'chevron-down': 'expand_more', 'chevron-right': 'chevron_right', pencil: 'edit', play: 'play_arrow',
    ellipsis: 'more_horiz', pin: 'push_pin', bell: 'notifications', 'share-2': 'share', hash: 'tag',
    'trending-up': 'trending_up', 'trending-down': 'trending_down', 'arrow-up': 'arrow_upward',
    'arrow-down': 'arrow_downward', loader: 'progress_activity', 'party-popper': 'celebration',
    beer: 'sports_bar', pizza: 'local_pizza', zap: 'bolt'
  };

  /* opts: {size, color, weight, fill, label, class} */
  function Icon(name, opts) {
    opts = opts || {};
    var size = opts.size || 18;
    var glyph = ALIAS[name] || String(name).replace(/-/g, '_');
    var style = {
      fontSize: size + 'px', width: size + 'px', height: size + 'px',
      fontVariationSettings: '"FILL" ' + (opts.fill || 0) + ', "wght" ' + (opts.weight || 400) +
        ', "GRAD" 0, "opsz" ' + Math.max(20, Math.min(48, size))
    };
    if (opts.color) style.color = opts.color;

    return h('span.sa-icon', {
      class: opts.class,
      role: opts.label ? 'img' : 'presentation',
      'aria-label': opts.label || null,
      'aria-hidden': opts.label ? null : 'true',
      translate: 'no',
      style: style
    }, glyph);
  }

  window.SA_ICON = { Icon: Icon, ALIAS: ALIAS };
  window.Icon = Icon;
})();
