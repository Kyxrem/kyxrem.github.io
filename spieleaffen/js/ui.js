/* SpieleAffen UI-Helfer: DOM-Kürzel, Tab-Bar, Toast, Demo-Banner. */
(function (root) {
  'use strict';
  const UI = {};

  UI.h = function (tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => {
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    children.flat(Infinity).forEach((c) => {
      if (c === null || c === undefined || c === false) return;
      el.append(c.nodeType ? c : document.createTextNode(c));
    });
    return el;
  };
  UI.qs = (sel, el) => (el || document).querySelector(sel);
  UI.clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

  const TABS = [
    { id: 'start', href: 'index.html', ico: '📻', label: 'Start' },
    { id: 'abende', href: 'abende.html', ico: '🎲', label: 'Abende' },
    { id: 'plus', href: 'edit.html', ico: '+', label: '' },
    { id: 'pokale', href: 'pokale.html', ico: '🏆', label: 'Pokale' },
    { id: 'affen', href: 'spieler.html', ico: '🐵', label: 'Affen' }
  ];
  UI.tabbar = function (active) {
    const demo = new URLSearchParams(location.search).has('demo') ? '?demo' : '';
    const bar = UI.h('nav', { class: 'tabbar' },
      UI.h('div', { class: 'inner' },
        TABS.map((t) => {
          if (t.id === 'plus') {
            return UI.h('a', { class: 'tab plus', href: t.href + demo, 'aria-label': 'Eintragen' }, UI.h('div', null, '+'));
          }
          return UI.h('a', { class: 'tab' + (t.id === active ? ' on' : ''), href: t.href + demo },
            UI.h('div', { class: 'ico' }, t.ico),
            UI.h('span', null, t.label));
        })
      ));
    document.body.append(bar);
  };

  let toastTimer = null;
  UI.toast = function (msg, isErr) {
    let el = UI.qs('.toast');
    if (!el) { el = UI.h('div', { class: 'toast' }); document.body.append(el); }
    el.textContent = msg;
    el.classList.toggle('err', !!isErr);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), isErr ? 5200 : 2800);
  };

  UI.demoBanner = function (container) {
    if (!new URLSearchParams(location.search).has('demo')) return;
    const path = location.pathname.split('/').pop() || 'index.html';
    container.prepend(UI.h('div', { class: 'demobanner' },
      'Demo-Daten — nur zum Angucken. ', UI.h('a', { href: path }, 'Zur echten Runde')));
  };

  UI.fail = function (container, err) {
    UI.clear(container).append(UI.h('div', { class: 'empty' },
      UI.h('div', { class: 'big' }, '🙈'),
      UI.h('h3', null, 'Daten nicht ladbar'),
      UI.h('p', null, String(err && err.message || err))));
  };

  UI.ava = function (player, cls) {
    return UI.h('div', { class: 'ava ' + (cls || '') }, player.monkey || player.name.slice(0, 2).toUpperCase());
  };

  root.UI = UI;
})(window);
