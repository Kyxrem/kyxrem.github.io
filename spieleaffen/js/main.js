/* SpieleAffen — main.js
 * Router und Start. Lädt die Daten, zeichnet die Schale, hört auf den Store.
 */
(function () {
  'use strict';
  var h = window.h, U = window.SA_UI, S = window.SA_STORE, SH = window.SA_SHELL;

  var root = document.getElementById('app');

  function gueltig(view) {
    return SH.NAV.some(function (n) { return n.id === view; });
  }

  window.addEventListener('hashchange', function () {
    var view = location.hash.slice(1);
    if (gueltig(view)) S.navigate(view);
  });

  function ladeAnsicht(text, aktion) {
    window.SA_DOM.mount(root, h('div.sa-boot', null,
      h('div.sa-wordmark', { style: { fontSize: '32px' } }, 'Spiele', h('em', 'Affen')),
      h('p.sa-body', text),
      aktion || null));
  }

  ladeAnsicht('Lade den Block …');

  S.init().then(function () {
    var state = S.get();
    if (!gueltig(state.view)) state.view = 'abend';
    S.on(function (s, opts) { SH.render(root, s, opts); });
    SH.render(root, state);
    if (state.loadError) {
      S.toast('Offline', 'Server nicht erreichbar. Du siehst den letzten Stand.', 'banana');
    }
  }).catch(function (err) {
    ladeAnsicht('Daten konnten nicht geladen werden: ' + err.message,
      U.Button({ children: 'Nochmal', iconLeft: 'refresh', onClick: function () { location.reload(); } }));
  });
})();
