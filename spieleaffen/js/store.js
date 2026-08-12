/* SpieleAffen — store.js
 * Ein Zustand, eine Wahrheit. Screens lesen daraus und ändern ihn über
 * update(); danach wird neu gerechnet, neu gezeichnet und gespeichert.
 *
 * Schreibkonflikte: jeder Speichervorgang trägt die Revision, auf der er
 * beruht. Kommt vom Server eine 409, war jemand schneller — dann werden die
 * frischen Daten geholt und die Änderung ehrlich als verloren gemeldet,
 * statt sie still zu überschreiben.
 */
(function () {
  'use strict';
  var SA = window.SA, API = window.SA_API;

  var DEMO_CODES = { maik: '1111', mattes: '2222', bene: '3333', torben: '4444', benni: '5555', tobi: '6666' };
  var LS_DEMO_CODES = 'sa_demo_codes_v1';
  var LS_VIEW = 'sa_view_v1';

  var state = {
    doc: null,
    rev: 0,
    source: 'demo',      // 'remote' | 'cache' | 'demo'
    loadError: null,
    saving: false,
    saveError: null,
    me: null,            // {id, name, admin} sobald eingeloggt
    log: [],
    view: 'uebersicht',
    toasts: []
  };

  var listeners = [];
  var cache = { key: null, value: null };
  var toastSeq = 0;

  function on(fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; }
  function emit(opts) { listeners.forEach(function (fn) { fn(state, opts); }); }
  /* Eine kommende oder gehende Meldung ist kein Grund, den ganzen Screen neu
     zu bauen: wer genau in dem Moment tippt, träfe sonst ins Leere, weil der
     Knopf unter dem Finger ausgetauscht wird. */
  function emitToasts() { emit({ nurToasts: true }); }
  function get() { return state; }

  /* SA.compute() ist nicht billig — Ergebnis halten, bis sich das Dokument ändert. */
  function computed() {
    var key = state.rev + ':' + state.docStamp;
    if (cache.key !== key) {
      cache.key = key;
      cache.value = SA.compute(state.doc || SA.emptyDoc());
    }
    return cache.value;
  }

  function stamp() { state.docStamp = Math.random().toString(36).slice(2); }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ── Uhr / Formatierung ───────────────────────────────────────────────────
  function uhr() {
    return new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }
  function heute() { return new Date().toISOString().slice(0, 10); }

  // ── Meldungen ────────────────────────────────────────────────────────────
  /* Ein Ton, eine Zeile Frechheit. Verschwindet nach gut vier Sekunden. */
  function toast(title, message, tone) {
    var entry = { id: ++toastSeq, title: title, message: message, tone: tone || 'slime' };
    state.toasts = state.toasts.concat([entry]);
    emitToasts();
    setTimeout(function () { dismiss(entry.id); }, 4200);
  }
  function dismiss(id) {
    state.toasts = state.toasts.filter(function (t) { return t.id !== id; });
    emitToasts();
  }

  // ── Navigation ───────────────────────────────────────────────────────────
  function navigate(view) {
    if (state.view === view) return;
    state.view = view;
    try { localStorage.setItem(LS_VIEW, view); } catch (e) { /* egal */ }
    if (location.hash.slice(1) !== view) location.hash = view;
    window.scrollTo(0, 0);
    emit();
  }

  // ── Laden ────────────────────────────────────────────────────────────────
  function init() {
    var startView = (location.hash || '').slice(1);
    if (!startView) { try { startView = localStorage.getItem(LS_VIEW) || ''; } catch (e) { /* egal */ } }
    if (startView) state.view = startView;

    return API.loadData().then(function (res) {
      state.doc = res.data;
      state.rev = res.rev || 0;
      state.source = res.source;
      state.loadError = res.error || null;
      stamp();
      return Promise.all([API.me(), API.loadLog(60)]);
    }).then(function (both) {
      state.me = both[0] || restoreDemoSession();
      state.log = (both[1] && both[1].entries) || loadDemoLog();
      emit();
    }).catch(function (err) {
      state.loadError = err;
      emit();
      throw err;
    });
  }

  // ── Anmeldung mit dem eigenen vierstelligen Code ─────────────────────────
  function demoCodes() {
    var stored = null;
    try { stored = JSON.parse(localStorage.getItem(LS_DEMO_CODES) || 'null'); } catch (e) { /* egal */ }
    return stored || DEMO_CODES;
  }
  function setDemoCode(playerId, code) {
    var all = clone(demoCodes());
    if (code) all[playerId] = String(code); else delete all[playerId];
    try { localStorage.setItem(LS_DEMO_CODES, JSON.stringify(all)); } catch (e) { /* egal */ }
  }
  function restoreDemoSession() {
    if (API.hasBackend()) return null;
    try {
      var raw = sessionStorage.getItem('sa_demo_me');
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function login(code) {
    if (API.hasBackend()) {
      return API.login(code).then(function (player) {
        state.me = player;
        emit();
        return player;
      });
    }
    // Demo: lokal prüfen, damit die Screens ohne Backend vollständig laufen.
    var codes = demoCodes();
    var hit = Object.keys(codes).filter(function (pid) { return codes[pid] === String(code); })[0];
    var player = hit && (state.doc.players || []).filter(function (p) { return p.id === hit; })[0];
    if (!player) {
      var err = new Error('Code stimmt nicht');
      err.status = 401;
      return Promise.reject(err);
    }
    state.me = { id: player.id, name: player.name, admin: !!player.admin };
    try { sessionStorage.setItem('sa_demo_me', JSON.stringify(state.me)); } catch (e) { /* egal */ }
    emit();
    return Promise.resolve(state.me);
  }

  function logout() {
    state.me = null;
    try { sessionStorage.removeItem('sa_demo_me'); } catch (e) { /* egal */ }
    // Beim nächsten Öffnen soll wieder das Vier-Ziffern-Feld vorn stehen.
    if (window.SA_GATE) window.SA_GATE.zuruecksetzen();
    emit();
    return API.logout();
  }

  // ── Ändern ───────────────────────────────────────────────────────────────
  /* mutator(doc) verändert eine Kopie. opts: {summary, entries, debounce}
     entries sind die Zeilen fürs Änderungs-Log (ohne Zeit und Name — die
     setzt der Server bzw. hier der Demo-Modus).

     opts.debounce sammelt schnelle Folgeänderungen (Würfel antippen, ±-Tasten)
     und schickt sie als einen Speichervorgang los, statt bei jedem Klick eine
     PUT-Anfrage abzufeuern. */
  var wartend = null;

  function update(mutator, opts) {
    opts = opts || {};
    if (!state.me && !opts.anonymous) {
      toast('Erst der Code', 'Ohne eigenen Code wird hier nichts geändert.', 'punsch');
      return Promise.reject(new Error('nicht angemeldet'));
    }
    var next = clone(state.doc);
    if (mutator(next) === false) return Promise.resolve(null);

    var vorher = state.doc, vorherRev = state.rev;
    state.doc = next;
    stamp();

    var entries = (opts.entries || []).map(function (e) {
      return Object.assign({ time: uhr(), actor: state.me ? state.me.name : 'System' }, e);
    });
    if (entries.length) state.log = entries.concat(state.log).slice(0, 200);

    if (opts.debounce) {
      if (!wartend) wartend = { rev: vorherRev, summary: opts.summary || '', entries: [] };
      wartend.summary = opts.summary || wartend.summary;
      wartend.entries = wartend.entries.concat(entries);
      clearTimeout(wartend.timer);
      wartend.timer = setTimeout(flush, opts.debounce);
      emit();
      return Promise.resolve(null);
    }

    if (wartend) { clearTimeout(wartend.timer); vorherRev = wartend.rev; entries = wartend.entries.concat(entries); wartend = null; }

    state.saving = true;
    state.saveError = null;
    emit();
    return persist(vorher, vorherRev, opts.summary || '', entries);
  }

  /* Schickt die gesammelten Änderungen los. */
  function flush() {
    if (!wartend) return Promise.resolve(null);
    var w = wartend;
    wartend = null;
    clearTimeout(w.timer);
    state.saving = true;
    emit();
    return persist(null, w.rev, w.summary, w.entries);
  }

  function persist(vorher, vorherRev, summary, entries) {
    var doc = state.doc;
    return API.saveData(doc, vorherRev, summary, entries).then(function (res) {
      state.rev = res && res.rev != null ? res.rev : vorherRev;
      state.saving = false;
      if (!API.hasBackend()) saveDemoLog();
      emit();
      return res;
    }).catch(function (err) {
      state.saving = false;
      if (vorher) { state.doc = vorher; state.rev = vorherRev; stamp(); }
      if (err.status === 409) {
        toast('Zu langsam', 'Jemand anderes war schneller. Wir laden neu.', 'punsch');
        return init();
      }
      state.saveError = err;
      toast('Nicht gespeichert', err.message + '. Bitte noch einmal.', 'punsch');
      emit();
      throw err;
    });
  }

  function loadDemoLog() {
    try { return JSON.parse(localStorage.getItem('sa_demo_log_v1') || '[]'); } catch (e) { return []; }
  }
  function saveDemoLog() {
    try { localStorage.setItem('sa_demo_log_v1', JSON.stringify(state.log.slice(0, 200))); } catch (e) { /* egal */ }
  }

  function resetDemo() {
    API.resetDemo();
    try {
      localStorage.removeItem('sa_demo_log_v1');
      localStorage.removeItem(LS_DEMO_CODES);
      sessionStorage.removeItem('sa_demo_me');
    } catch (e) { /* egal */ }
    location.reload();
  }

  // ── Abkürzungen, die viele Screens brauchen ──────────────────────────────
  function affen(scope, opts) {
    return computed().standings(scope || 'all', Object.assign({ youId: state.me && state.me.id }, opts || {}));
  }
  function istAdmin() { return !!(state.me && state.me.admin); }
  function darfSchreiben() { return !!state.me; }

  window.SA_STORE = {
    get: get, on: on, emit: emit, computed: computed,
    init: init, update: update, flush: flush, navigate: navigate,
    login: login, logout: logout,
    toast: toast, dismiss: dismiss,
    affen: affen, istAdmin: istAdmin, darfSchreiben: darfSchreiben,
    demoCodes: demoCodes, setDemoCode: setDemoCode, resetDemo: resetDemo,
    uhr: uhr, heute: heute, clone: clone
  };
})();
