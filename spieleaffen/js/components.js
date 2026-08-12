/* SpieleAffen — components.js
 *
 * Die 24 Komponenten des Design-Systems als DOM-Fabriken. Jede Funktion nimmt
 * ein Options-Objekt, das dem jeweiligen .d.ts-Kontrakt entspricht, und gibt
 * einen fertigen Knoten zurück. Aussehen und Zustände stecken in
 * css/components.css — hier ist nur Struktur und Verhalten.
 *
 *   SA_UI.Button({ children: 'Eintragen', iconLeft: 'plus', onClick: f })
 *
 * Reihenfolge wie im Bundle: core · forms · navigation · feedback · players · games
 */
(function () {
  'use strict';
  var h = window.h;
  var Icon = window.SA_ICON.Icon;

  /* Der Rest hält die Farbe im Bereich, falls doch mal eine Nummer aus der
     Reihe kommt — die Zahl der Sitzfarben steht in der Engine. */
  function seatVar(seat) {
    var n = (window.SA && window.SA.SEATS ? window.SA.SEATS.length : 9);
    return 'var(--seat-' + (((Number(seat) || 1) - 1) % n + 1) + ')';
  }

  /* Zahlen tragen den typografischen Minus (−), nicht den Bindestrich — und
     das Dezimalkomma, nicht den Punkt. Halbe Punkte gibt es seit die Plätze
     geteilt werden; „3,5" liest sich deutsch, „3.5" wie ein Tippfehler.
     Gerundet wird auf zwei Stellen, nachgestellte Nullen fallen weg. */
  function num(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'number' && isFinite(v)) {
      var gerundet = Math.round(v * 100) / 100;
      var text = String(gerundet);
      if (text.indexOf('.') >= 0) text = text.replace('.', ',');
      return text.replace(/-/g, '−');
    }
    return String(v).replace(/-/g, '−');
  }

  function initials(name) {
    return String(name || '').trim().split(/\s+/).slice(0, 2)
      .map(function (w) { return w[0] || ''; }).join('').toUpperCase();
  }

  /* ═══ core/Button ═════════════════════════════════════════════════════ */
  function Button(o) {
    o = o || {};
    var size = o.size || 'md';
    var dead = o.disabled || o.loading;
    return h('button', {
      type: o.type || 'button',
      class: ['sa-btn', 'sa-btn--' + (o.variant || 'primary'), 'sa-btn--' + size,
        o.fullWidth && 'sa-btn--full', o.loading && 'sa-btn--loading', o.class],
      disabled: !!dead,
      // Der Handler hängt immer dran: ein Button, der erst später scharf
      // geschaltet wird (button.disabled = false), hätte sonst nie einen.
      // Ein deaktivierter Button feuert von sich aus kein click-Ereignis.
      onclick: o.onClick,
      title: o.title || null,
      style: o.style
    },
      o.loading ? Icon('loader', { size: iconFor(size) })
        : o.iconLeft ? Icon(o.iconLeft, { size: iconFor(size) }) : null,
      o.children,
      o.iconRight ? Icon(o.iconRight, { size: iconFor(size) }) : null
    );
  }
  function iconFor(size) { return size === 'sm' ? 14 : size === 'lg' ? 20 : 16; }

  /* ═══ core/IconButton ═════════════════════════════════════════════════ */
  function IconButton(o) {
    o = o || {};
    var size = o.size || 'md';
    return h('button', {
      type: 'button',
      class: ['sa-iconbtn', 'sa-iconbtn--' + size, 'sa-iconbtn--' + (o.variant || 'ghost'),
        o.active && 'is-active', o.class],
      'aria-label': o.label,
      'aria-pressed': o.active ? 'true' : null,
      title: o.label,
      disabled: !!o.disabled,
      onclick: o.onClick,
      style: o.style
    }, Icon(o.icon, { size: size === 'sm' ? 14 : size === 'lg' ? 22 : 18 }));
  }

  /* ═══ core/Badge ══════════════════════════════════════════════════════ */
  function Badge(o) {
    o = o || {};
    var sm = o.size === 'sm';
    var variant = o.variant || 'soft';
    return h('span', {
      class: ['sa-badge', 'sa-badge--' + (o.tone || 'neutral'), sm && 'sa-badge--sm',
        variant === 'solid' && 'is-solid', variant === 'outline' && 'is-outline', o.class],
      style: o.style
    },
      o.dot ? h('span.sa-badge__dot') : null,
      o.icon ? Icon(o.icon, { size: sm ? 11 : 13 }) : null,
      o.children
    );
  }

  /* ═══ core/Tag ════════════════════════════════════════════════════════ */
  function Tag(o) {
    o = o || {};
    var sm = o.size === 'sm';
    return h('span', {
      class: ['sa-tag', sm && 'sa-tag--sm', o.onRemove && 'sa-tag--removable',
        o.onClick && 'sa-tag--clickable', o.selected && 'is-selected', o.class],
      style: Object.assign({ '--sa-tag-color': o.color || 'var(--line-strong)' }, o.style || {}),
      onclick: o.onClick
    },
      h('span.sa-tag__dot'),
      o.children,
      o.onRemove ? h('button.sa-tag__x', {
        type: 'button', 'aria-label': 'Entfernen',
        onclick: function (e) { e.stopPropagation(); o.onRemove(e); }
      }, Icon('x', { size: sm ? 11 : 13 })) : null
    );
  }

  /* ═══ core/Card ═══════════════════════════════════════════════════════ */
  function Card(o) {
    o = o || {};
    var flush = o.padding === '0' || o.padding === 0;
    var head = (o.eyebrow || o.title || o.action)
      ? h('header.sa-card__head', null,
          h('div.sa-card__heading', null,
            o.eyebrow ? h('span.sa-card__eyebrow', o.eyebrow) : null,
            o.title ? h('h3.sa-card__title', o.title) : null),
          o.action || null)
      : null;
    return h('section', {
      class: ['sa-card', o.tone && o.tone !== 'default' && 'sa-card--' + o.tone,
        flush && 'sa-card--flush', o.interactive && 'sa-card--interactive', o.class],
      onclick: o.onClick, style: o.style
    },
      head, o.children,
      o.footer ? h('footer.sa-card__foot', o.footer) : null
    );
  }

  /* ═══ core/StatTile ═══════════════════════════════════════════════════ */
  function StatTile(o) {
    o = o || {};
    var down = o.deltaDirection === 'down';
    return h('div', {
      class: ['sa-stat', o.tone && o.tone !== 'neutral' && 'sa-stat--' + o.tone, o.class],
      style: o.style
    },
      h('div.sa-stat__top', null,
        h('span.sa-stat__label', o.label),
        o.icon ? Icon(o.icon, { size: 16, color: 'var(--text-faint)' }) : null),
      h('div.sa-stat__figure', null,
        h('span.sa-stat__value', num(o.value)),
        o.unit ? h('span.sa-stat__unit', o.unit) : null),
      o.delta ? h('span', { class: ['sa-stat__delta', down && 'is-down'] },
        Icon(down ? 'trending-down' : 'trending-up', { size: 13 }), o.delta) : null
    );
  }

  /* ═══ core/Tease ══════════════════════════════════════════════════════ */
  var TEASE_ICON = { brag: 'trophy', burn: 'skull', neutral: 'chat_bubble' };
  function Tease(o) {
    o = o || {};
    var tone = o.tone || 'neutral';
    var glyph = o.icon === null ? null : (o.icon || TEASE_ICON[tone] || TEASE_ICON.neutral);
    return h('span', {
      class: ['sa-tease', 'sa-tease--' + tone, o.size === 'sm' && 'sa-tease--sm', o.class],
      style: o.style
    },
      glyph ? Icon(glyph, { size: o.size === 'sm' ? 12 : 14 }) : null,
      o.children
    );
  }

  /* ═══ forms/Input ═════════════════════════════════════════════════════ */
  var fieldId = 0;
  function Input(o) {
    o = o || {};
    var id = o.id || 'in-' + (++fieldId);
    var input = h('input', {
      id: id, type: o.type || 'text',
      value: o.value != null ? o.value : (o.defaultValue != null ? o.defaultValue : ''),
      placeholder: o.placeholder || null,
      inputMode: o.inputMode || null,
      maxLength: o.maxLength || null,
      disabled: !!o.disabled,
      oninput: o.onInput, onchange: o.onChange, onkeydown: o.onKeyDown, onblur: o.onBlur
    });
    var node = h('label', {
      class: ['sa-field', o.size && o.size !== 'md' && 'sa-field--' + o.size,
        o.error && 'sa-field--error', o.disabled && 'sa-field--disabled', o.class],
      for: id, style: o.style
    },
      o.label ? h('span.sa-field__label', o.label) : null,
      h('span.sa-field__box', null,
        o.icon ? Icon(o.icon, { size: 16, color: 'var(--text-faint)' }) : null,
        input,
        o.suffix ? h('span.sa-field__suffix', o.suffix) : null),
      (o.error || o.hint) ? h('span.sa-field__hint', o.error || o.hint) : null
    );
    node.input = input;
    return node;
  }

  /* ═══ forms/Select ════════════════════════════════════════════════════ */
  function Select(o) {
    o = o || {};
    var id = o.id || 'sel-' + (++fieldId);
    var select = h('select', {
      id: id, disabled: !!o.disabled, onchange: o.onChange
    }, (o.options || []).map(function (raw) {
      var opt = typeof raw === 'string' ? { value: raw, label: raw } : raw;
      return h('option', { value: opt.value, selected: String(opt.value) === String(o.value) }, opt.label);
    }));
    if (o.value != null) select.value = String(o.value);
    var node = h('label', {
      class: ['sa-field', o.size && o.size !== 'md' && 'sa-field--' + o.size, o.class],
      for: id, style: o.style
    },
      o.label ? h('span.sa-field__label', o.label) : null,
      h('span.sa-select__box', null, select,
        Icon('chevron-down', { size: 16, class: 'sa-select__chev' })),
      o.hint ? h('span.sa-field__hint', o.hint) : null
    );
    node.select = select;
    return node;
  }

  /* ═══ forms/Checkbox ══════════════════════════════════════════════════ */
  function Checkbox(o) {
    o = o || {};
    return h('label', { class: ['sa-check', o.disabled && 'is-disabled', o.class], style: o.style },
      h('input', {
        type: 'checkbox', checked: !!o.checked, disabled: !!o.disabled,
        onchange: o.onChange
      }),
      h('span.sa-check__box', { 'aria-hidden': 'true' }, Icon('check', { size: 13 })),
      h('span.sa-check__text', null,
        h('span.sa-check__label', o.label),
        o.hint ? h('span.sa-check__hint', o.hint) : null)
    );
  }

  /* ═══ forms/Switch ════════════════════════════════════════════════════ */
  function Switch(o) {
    o = o || {};
    return h('label', {
      class: ['sa-switch', o.size === 'sm' && 'sa-switch--sm', o.disabled && 'is-disabled', o.class],
      style: o.style
    },
      h('input', { type: 'checkbox', role: 'switch', checked: !!o.checked, disabled: !!o.disabled, onchange: o.onChange }),
      h('span.sa-switch__track', { 'aria-hidden': 'true' }, h('span.sa-switch__knob')),
      o.label ? h('span.sa-switch__label', o.label) : null
    );
  }

  /* ═══ forms/PinInput ══════════════════════════════════════════════════ */
  /* Feste Länge, eine kantige Zelle je Ziffer, springt von selbst weiter. */
  function PinInput(o) {
    o = o || {};
    var length = o.length || 4;
    var boxes = [];
    var value = String(o.value || '').slice(0, length);

    function read() {
      return boxes.map(function (b) { return b.value; }).join('');
    }
    function emit() {
      var v = read();
      boxes.forEach(function (b) { b.classList.toggle('is-filled', !!b.value); });
      if (o.onChange) o.onChange(v);
      if (o.onComplete && v.length === length) o.onComplete(v);
    }

    for (var i = 0; i < length; i++) {
      boxes.push(h('input', {
        value: value[i] || '',
        inputMode: 'numeric',
        type: o.mask ? 'password' : 'text',
        maxLength: 1,
        autocomplete: 'off',
        'aria-label': 'Stelle ' + (i + 1),
        class: value[i] ? 'is-filled' : null,
        oninput: (function (idx) {
          return function (e) {
            e.target.value = e.target.value.slice(-1).replace(/[^0-9a-zA-Z]/g, '');
            if (e.target.value && idx < length - 1) boxes[idx + 1].focus();
            emit();
          };
        })(i),
        onkeydown: (function (idx) {
          return function (e) {
            if (e.key === 'Backspace' && !e.target.value && idx > 0) boxes[idx - 1].focus();
            if (e.key === 'ArrowLeft' && idx > 0) boxes[idx - 1].focus();
            if (e.key === 'ArrowRight' && idx < length - 1) boxes[idx + 1].focus();
          };
        })(i),
        onpaste: function (e) {
          var text = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9a-zA-Z]/g, '');
          if (!text) return;
          e.preventDefault();
          boxes.forEach(function (b, j) { b.value = text[j] || ''; });
          boxes[Math.min(text.length, length - 1)].focus();
          emit();
        }
      }));
    }

    var node = h('div', { class: ['sa-pin', o.invalid && 'sa-pin--invalid', o.class], style: o.style },
      o.label ? h('span.sa-field__label', o.label) : null,
      h('div.sa-pin__boxes', boxes),
      o.hint ? h('span.sa-pin__hint', o.hint) : null
    );
    node.clear = function () { boxes.forEach(function (b) { b.value = ''; b.classList.remove('is-filled'); }); boxes[0].focus(); };
    node.focus = function () { boxes[0].focus(); };
    if (o.autoFocus) setTimeout(function () { boxes[0].focus(); }, 0);
    return node;
  }

  /* ═══ navigation/Tabs ═════════════════════════════════════════════════ */
  function Tabs(o) {
    o = o || {};
    var pill = o.variant === 'pill';
    var buttons = (o.items || []).map(function (item) {
      return h('button', {
        type: 'button', role: 'tab',
        class: ['sa-tab', item.id === o.value && 'is-active'],
        'aria-selected': item.id === o.value ? 'true' : 'false',
        onclick: function () { if (o.onChange) o.onChange(item.id); }
      },
        item.label,
        item.count != null ? h('span.sa-tab__count', String(item.count)) : null
      );
    });
    return h('div', {
      role: 'tablist',
      class: ['sa-tabs', pill && 'sa-tabs--pill', o.class],
      style: o.style
    }, buttons);
  }

  /* ═══ navigation/SidebarItem ══════════════════════════════════════════ */
  function SidebarItem(o) {
    o = o || {};
    return h('button', {
      type: 'button',
      class: ['sa-navitem', o.active && 'is-active', o.class],
      // Titel und aria-label sitzen immer, weil die Beschriftung in der
      // schmalen Leiste und am Telefon per CSS verschwindet.
      title: o.label,
      'aria-label': o.label,
      'aria-current': o.active ? 'page' : null,
      onclick: o.onClick, style: o.style
    },
      Icon(o.icon, { size: 18 }),
      o.collapsed ? null : h('span.sa-navitem__label', o.label),
      (!o.collapsed && o.badge != null) ? h('span.sa-navitem__badge', String(o.badge)) : null
    );
  }

  /* ═══ feedback/Dialog ═════════════════════════════════════════════════ */
  /* Gibt das Scrim zurück; Aufrufer hängt es an document.body und entfernt es wieder. */
  function Dialog(o) {
    o = o || {};
    var panel = h('div', {
      role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title,
      class: ['sa-dialog', o.tone === 'neon' && 'sa-dialog--neon'],
      style: { '--sa-dialog-w': (o.width || 460) + 'px' },
      onclick: function (e) { e.stopPropagation(); }
    },
      h('header.sa-dialog__head', null,
        h('div.sa-card__heading', null,
          o.eyebrow ? h('span.sa-dialog__eyebrow', o.eyebrow) : null,
          h('h2.sa-dialog__title', o.title)),
        o.onClose ? IconButton({ icon: 'x', label: 'Schließen', onClick: o.onClose }) : null),
      h('div.sa-dialog__body', o.children),
      o.footer ? h('footer.sa-dialog__foot', o.footer) : null
    );
    var scrim = h('div.sa-scrim', { role: 'presentation', onclick: o.onClose || null }, panel);
    scrim.panel = panel;
    return scrim;
  }

  /* ═══ feedback/Toast ══════════════════════════════════════════════════ */
  var TOAST_ICON = { slime: 'check', banana: 'party-popper', punsch: 'skull', neutral: 'info' };
  function Toast(o) {
    o = o || {};
    var tone = o.tone || 'slime';
    return h('div', { role: 'status', class: ['sa-toast', 'sa-toast--' + tone], style: o.style },
      Icon(o.icon || TOAST_ICON[tone] || TOAST_ICON.neutral, { size: 18, style: { marginTop: '1px' } }),
      h('div.sa-toast__text', null,
        h('strong.sa-toast__title', o.title),
        o.message ? h('span.sa-toast__msg', o.message) : null),
      o.onDismiss ? h('button.sa-toast__x', {
        type: 'button', 'aria-label': 'Ausblenden', onclick: o.onDismiss
      }, Icon('x', { size: 14 })) : null
    );
  }

  /* ═══ feedback/Tooltip ════════════════════════════════════════════════ */
  function Tooltip(o) {
    o = o || {};
    return h('span', { class: ['sa-tip', o.side && o.side !== 'top' && 'sa-tip--' + o.side, o.class], tabIndex: 0 },
      o.children,
      h('span.sa-tip__label', { role: 'tooltip' }, o.label)
    );
  }

  /* ═══ feedback/ProgressBar ════════════════════════════════════════════ */
  var BAR_TONE = { slime: 'var(--slime-500)', banana: 'var(--banana-500)', punsch: 'var(--punsch-500)', eis: 'var(--eis-500)' };
  function ProgressBar(o) {
    o = o || {};
    var value = Number(o.value) || 0, max = Number(o.max) || 100;
    var pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
    return h('div', {
      class: ['sa-progress', o.size && o.size !== 'md' && 'sa-progress--' + o.size,
        o.striped && 'sa-progress--striped', o.class],
      style: Object.assign({ '--sa-fill': BAR_TONE[o.tone || 'slime'] }, o.style || {})
    },
      (o.label || o.valueLabel) ? h('div.sa-progress__head', null,
        o.label ? h('span.sa-progress__label', o.label) : null,
        o.valueLabel ? h('span.sa-progress__value', o.valueLabel) : null) : null,
      h('div.sa-progress__track', {
        role: 'progressbar', 'aria-valuenow': value, 'aria-valuemax': max
      }, h('div.sa-progress__fill', { style: { width: pct + '%' } }))
    );
  }

  /* ═══ feedback/LogEntry ═══════════════════════════════════════════════ */
  var LOG_TONE = { neutral: 'var(--paper-300)', slime: 'var(--slime-500)', banana: 'var(--banana-500)', punsch: 'var(--punsch-500)', eis: 'var(--eis-500)' };
  function LogEntry(o) {
    o = o || {};
    var color = LOG_TONE[o.tone || 'neutral'] || LOG_TONE.neutral;
    return h('div', { class: ['sa-log', o.class], style: Object.assign({ '--sa-log-color': color }, o.style || {}) },
      h('span.sa-log__icon', Icon(o.icon || 'history', { size: 14 })),
      h('div.sa-log__body', null,
        h('span.sa-log__text', o.text),
        (o.from != null || o.to != null) ? h('span.sa-log__diff', null,
          o.from != null ? h('span.sa-log__from', String(o.from)) : null,
          (o.from != null && o.to != null) ? Icon('arrow-right', { size: 12, color: 'var(--text-faint)' }) : null,
          o.to != null ? h('span.sa-log__to', String(o.to)) : null) : null),
      h('span.sa-log__meta', null,
        h('span.sa-log__time', o.time || ''),
        o.actor ? h('span.sa-log__actor', o.actor) : null)
    );
  }

  /* ═══ players/PlayerAvatar ════════════════════════════════════════════ */
  function PlayerAvatar(o) {
    o = o || {};
    var size = o.size || 'md';
    var crownSize = (size === 'sm' || size === 'md') ? 12 : 16;
    return h('span', {
      class: ['sa-avatar', size !== 'md' && 'sa-avatar--' + size, o.live && 'sa-avatar--live', o.class],
      style: Object.assign({ '--sa-seat': seatVar(o.seat) }, o.style || {})
    },
      h('span.sa-avatar__tile', { title: o.name, 'aria-label': o.name }, initials(o.name)),
      o.crown ? h('span.sa-avatar__crown', Icon('crown', { size: crownSize, color: 'var(--rank-gold)' })) : null
    );
  }

  /* ═══ players/ScoreRow ════════════════════════════════════════════════ */
  function ScoreRow(o) {
    o = o || {};
    var rank = Number(o.rank);
    return h('div', {
      class: ['sa-scorerow', o.onClick && 'sa-scorerow--clickable', o.highlight && 'is-you', o.class],
      onclick: o.onClick, style: o.style
    },
      h('span', { class: ['sa-scorerow__rank', rank <= 3 && 'sa-scorerow__rank--' + rank] }, String(o.rank)),
      PlayerAvatar({ name: o.name, seat: o.seat, size: 'md', crown: rank === 1 }),
      h('span.sa-scorerow__id', null,
        h('span.sa-scorerow__name', o.name),
        o.meta ? h('span.sa-scorerow__meta', o.meta) : null),
      o.badge || null,
      // Nur echte Bewegung zeigen: „↑0" ist keine Information, nur Rauschen.
      o.delta ? h('span', { class: ['sa-scorerow__delta', o.delta < 0 && 'is-down'] },
        Icon(o.delta >= 0 ? 'arrow-up' : 'arrow-down', { size: 12 }),
        num(Math.abs(o.delta))) : null,
      h('span.sa-scorerow__points', num(o.points))
    );
  }

  /* ═══ games/DiceHistogram ═════════════════════════════════════════════ */
  /* Zwei Würfel: tatsächliche Balken gegen die erwarteten 36stel. */
  var WAYS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
  var NUMBERS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  function DiceHistogram(o) {
    o = o || {};
    var counts = o.counts || {};
    var height = o.height || 150;
    var showExpected = o.showExpected !== false;
    var total = NUMBERS.reduce(function (s, n) { return s + (counts[n] || 0); }, 0);
    var peak = Math.max.apply(null, [1].concat(NUMBERS.map(function (n) {
      return Math.max(counts[n] || 0, showExpected ? (total * WAYS[n]) / 36 : 0);
    })));

    return h('div', { class: ['sa-dice', o.class], style: Object.assign({ '--sa-dice-h': height + 'px' }, o.style || {}) },
      NUMBERS.map(function (n) {
        var c = counts[n] || 0;
        var exp = (total * WAYS[n]) / 36;
        var dev = c - exp;
        var hot = total >= 12 && dev >= Math.max(1.5, exp * 0.35);
        var cold = total >= 12 && dev <= -Math.max(1.5, exp * 0.35);
        return h('div.sa-dice__col', null,
          h('span', { class: ['sa-dice__count', c && 'has-rolls'] }, String(c)),
          h('div.sa-dice__track', null,
            h('div', {
              class: ['sa-dice__bar', n === 7 ? 'sa-dice__bar--seven' : hot ? 'sa-dice__bar--hot' : cold ? 'sa-dice__bar--cold' : null],
              style: { height: ((c / peak) * 100) + '%' }
            }),
            (showExpected && total > 0)
              ? h('span.sa-dice__expected', { style: { bottom: ((exp / peak) * 100) + '%' } })
              : null),
          o.onLog
            ? h('button', {
                type: 'button',
                class: ['sa-dice__btn', n === 7 && 'sa-dice__btn--seven'],
                onclick: function () { o.onLog(n); }
              }, String(n))
            : h('span.sa-dice__label', String(n))
        );
      })
    );
  }

  /* ═══ games/ScorePad ══════════════════════════════════════════════════ */
  /* Runde × Affe für Stichspiele: Gesagt / Gemacht je Zelle, laufende Summe. */
  function ScorePad(o) {
    o = o || {};
    var players = o.players || [];
    var rounds = o.rounds || [];
    var totals = o.totals || {};
    var cols = '64px repeat(' + players.length + ', minmax(84px, 1fr))';
    var best = players.length ? Math.max.apply(null, players.map(function (p) { return totals[p.id] || 0; })) : 0;

    return h('div', { class: ['sa-pad', o.class], style: Object.assign({ '--sa-pad-cols': cols }, o.style || {}) },
      h('div.sa-pad__head', null,
        h('span.sa-pad__eyebrow', 'Runde'),
        players.map(function (p) {
          return h('span.sa-pad__player', null,
            PlayerAvatar({ name: p.name, seat: p.seat, size: 'sm' }),
            h('span.sa-pad__pname', p.name));
        })),

      rounds.map(function (r) {
        var live = r.n === o.activeRound;
        // Verdeckt gespielte Runden werden beim Werten aufgedeckt — die Zeile
        // blitzt einmal auf, sonst wechselt die Tabelle lautlos.
        return h('div', { class: ['sa-pad__row', live && 'is-live', r.n === o.revealRound && 'is-aufgedeckt'] },
          h('span.sa-pad__n', null,
            h('span.sa-pad__num', String(r.n)),
            h('span.sa-pad__cards', r.cards ? r.cards + ' K' : '')),
          players.map(function (p) {
            var cell = (r.cells || {})[p.id] || {};
            if (live && o.renderActiveCell) return o.renderActiveCell(p, r, cell);
            var hit = cell.bid != null && cell.bid === cell.made;
            return h('span', { class: ['sa-pad__cell', cell.bid == null && 'is-empty'] },
              h('span', { class: ['sa-pad__bid', hit && 'is-hit'] },
                cell.bid == null ? '—' : cell.bid + '/' + cell.made),
              h('span.sa-pad__pts', cell.points == null ? '' : num((cell.points > 0 ? '+' : '') + cell.points)));
          }));
      }),

      h('div.sa-pad__foot', null,
        h('span.sa-pad__eyebrow', 'Summe'),
        players.map(function (p) {
          var v = totals[p.id] || 0;
          return h('span', { class: ['sa-pad__total', v === best && 'is-best'] }, num(v));
        }))
    );
  }

  window.SA_UI = {
    Icon: Icon, Button: Button, IconButton: IconButton, Badge: Badge, Tag: Tag,
    Card: Card, StatTile: StatTile, Tease: Tease,
    Input: Input, Select: Select, Checkbox: Checkbox, Switch: Switch, PinInput: PinInput,
    Tabs: Tabs, SidebarItem: SidebarItem,
    Dialog: Dialog, Toast: Toast, Tooltip: Tooltip, ProgressBar: ProgressBar, LogEntry: LogEntry,
    PlayerAvatar: PlayerAvatar, ScoreRow: ScoreRow,
    DiceHistogram: DiceHistogram, ScorePad: ScorePad,
    seatVar: seatVar, initials: initials, num: num
  };
})();
