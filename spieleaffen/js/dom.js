/* SpieleAffen — dom.js
 * Das einzige "Framework": ein Hyperscript-Helfer. Kein React, kein Build.
 *
 *   h('div.card', { onclick: f }, 'Text', h('span', 'mehr'))
 *
 * Tag-Syntax: 'div.a.b#id' — Klassen und id direkt im Tag.
 * Props: 'class' (String | Array | Objekt), 'style' (Objekt), on*-Handler,
 *        data- und aria-Schlüssel als Attribute, alles andere als Property.
 * Kinder: Strings, Zahlen, Nodes, Arrays, null/false/undefined (werden ignoriert).
 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var SVG_TAGS = { svg: 1, path: 1, circle: 1, rect: 1, g: 1, line: 1, polyline: 1, polygon: 1, text: 1 };

  function append(node, child) {
    if (child == null || child === false || child === true) return;
    if (Array.isArray(child)) { child.forEach(function (c) { append(node, c); }); return; }
    node.appendChild(child.nodeType ? child : document.createTextNode(String(child)));
  }

  function applyClass(node, value) {
    if (!value) return;
    if (typeof value === 'string') { value.split(/\s+/).forEach(function (c) { if (c) node.classList.add(c); }); return; }
    if (Array.isArray(value)) { value.forEach(function (c) { applyClass(node, c); }); return; }
    Object.keys(value).forEach(function (k) { if (value[k]) applyClass(node, k); });
  }

  function applyStyle(node, value) {
    if (typeof value === 'string') { node.setAttribute('style', value); return; }
    Object.keys(value).forEach(function (k) {
      if (value[k] == null) return;
      if (k.charAt(0) === '-') node.style.setProperty(k, String(value[k]));
      else node.style[k] = value[k];
    });
  }

  function h(tag, props) {
    var children = Array.prototype.slice.call(arguments, 2);

    // 'div.card.is-on#main' auseinandernehmen
    var name = 'div', classes = [], id = null;
    var m = String(tag).match(/^([a-zA-Z][\w-]*)?((?:[.#][\w-]+)*)$/);
    if (m) {
      if (m[1]) name = m[1];
      (m[2] || '').split(/(?=[.#])/).forEach(function (part) {
        if (!part) return;
        if (part.charAt(0) === '.') classes.push(part.slice(1));
        else id = part.slice(1);
      });
    } else {
      name = String(tag);
    }

    var node = SVG_TAGS[name] ? document.createElementNS(SVG_NS, name) : document.createElement(name);
    classes.forEach(function (c) { node.classList.add(c); });
    if (id) node.id = id;

    // Zweites Argument darf auch schon ein Kind sein
    if (props != null && (typeof props !== 'object' || props.nodeType || Array.isArray(props))) {
      children.unshift(props);
      props = null;
    }

    if (props) {
      Object.keys(props).forEach(function (key) {
        var value = props[key];
        if (value == null || value === false) return;
        if (key === 'class' || key === 'className') { applyClass(node, value); return; }
        if (key === 'style') { applyStyle(node, value); return; }
        if (key === 'children') { append(node, value); return; }
        if (key === 'ref' && typeof value === 'function') { value(node); return; }
        if (key.slice(0, 2) === 'on' && typeof value === 'function') {
          node.addEventListener(key.slice(2).toLowerCase(), value);
          return;
        }
        if (key === 'html') { node.innerHTML = value; return; }
        if (key === 'text') { node.textContent = value; return; }
        if (key === 'dataset') { Object.keys(value).forEach(function (d) { node.dataset[d] = value[d]; }); return; }
        if (SVG_TAGS[name] || key.indexOf('-') > -1 || key.slice(0, 5) === 'aria-' || key === 'role' || key === 'for') {
          node.setAttribute(key === 'for' ? 'for' : key, value === true ? '' : value);
          return;
        }
        if (key in node) { node[key] = value; return; }
        node.setAttribute(key, value === true ? '' : value);
      });
    }

    append(node, children);
    return node;
  }

  function frag() {
    var f = document.createDocumentFragment();
    append(f, Array.prototype.slice.call(arguments));
    return f;
  }

  function clear(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  function mount(node, content) {
    clear(node);
    append(node, content);
    return node;
  }

  // Escaped für die wenigen Stellen, an denen doch mal innerHTML nötig ist.
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  window.h = h;
  window.SA_DOM = { h: h, frag: frag, clear: clear, mount: mount, esc: esc, append: append };
})();
