/* SpieleAffen — api.js
 * Datenzugriff: Cloudflare-Worker-Backend (wenn in config.js konfiguriert)
 * oder Demo-Modus mit den Beispieldaten.
 *
 * Lesen ist öffentlich. Schreiben braucht eine Sitzung, und eine Sitzung
 * bekommt man mit dem eigenen vierstelligen Code — nicht mit einem geteilten.
 * Der Code wandert genau einmal über die Leitung und wird gegen ein
 * Sitzungs-Token getauscht; danach reist nur noch das Token mit.
 */
(function () {
  'use strict';

  var cfg = window.SPIELEAFFEN_CONFIG || {};
  var base = (cfg.apiBase || '').replace(/\/+$/, '');
  var LS_TOKEN = 'sa_session_v1';
  var LS_CACHE = 'sa_cache_v1';
  var LS_DEMO = 'sa_demo_doc_v1';

  function hasBackend() { return !!base; }

  function req(path, opts) {
    opts = opts || {};
    var headers = {};
    var token = opts.token === undefined ? getToken() : opts.token;
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(base + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      return r.text().then(function (txt) {
        var json = null;
        try { json = txt ? JSON.parse(txt) : null; } catch (e) { /* kein JSON */ }
        if (!r.ok) {
          var err = new Error((json && json.error) || ('HTTP ' + r.status));
          err.status = r.status;
          err.body = json;
          throw err;
        }
        return json;
      });
    });
  }

  // ── Sitzung ──────────────────────────────────────────────────────────────
  function getToken() { try { return localStorage.getItem(LS_TOKEN) || ''; } catch (e) { return ''; } }
  function setToken(t) {
    try { t ? localStorage.setItem(LS_TOKEN, t) : localStorage.removeItem(LS_TOKEN); } catch (e) { /* egal */ }
  }

  /* Vierstelliger Code rein, Sitzung raus. 401 = falsch, 429 = zu oft falsch. */
  function login(code) {
    if (!hasBackend()) {
      // Demo: der Code steht in den Daten, geprüft wird lokal.
      return Promise.resolve(null);
    }
    return req('/api/login', { method: 'POST', token: null, body: { code: String(code) } })
      .then(function (res) { setToken(res.token); return res.player; });
  }

  function logout() {
    var token = getToken();
    setToken('');
    if (!hasBackend() || !token) return Promise.resolve();
    return req('/api/logout', { method: 'POST', token: token }).catch(function () { /* egal */ });
  }

  function me() {
    if (!hasBackend() || !getToken()) return Promise.resolve(null);
    return req('/api/me').catch(function () { setToken(''); return null; });
  }

  // ── Lesen ────────────────────────────────────────────────────────────────
  /* → {data, rev, updatedAt, source: 'remote'|'cache'|'demo'} */
  function loadData() {
    if (!hasBackend()) {
      var local = null;
      try { local = JSON.parse(localStorage.getItem(LS_DEMO) || 'null'); } catch (e) { /* egal */ }
      return Promise.resolve({ data: local || window.SA_DEMO_DATA, rev: 0, updatedAt: null, source: 'demo' });
    }
    return req('/api/data', { token: null }).then(function (res) {
      try { localStorage.setItem(LS_CACHE, JSON.stringify(res)); } catch (e) { /* voll */ }
      return { data: res.data, rev: res.rev, updatedAt: res.updatedAt, source: 'remote' };
    }).catch(function (err) {
      var cached = null;
      try { cached = JSON.parse(localStorage.getItem(LS_CACHE) || 'null'); } catch (e) { /* egal */ }
      if (cached && cached.data) {
        return { data: cached.data, rev: cached.rev, updatedAt: cached.updatedAt, source: 'cache', error: err };
      }
      throw err;
    });
  }

  function loadLog(limit) {
    if (!hasBackend()) return Promise.resolve({ entries: [] });
    return req('/api/log' + (limit ? '?limit=' + limit : ''), { token: null });
  }

  // ── Schreiben ────────────────────────────────────────────────────────────
  /* Speichert das komplette Dokument. `entries` sind die Log-Zeilen zu dieser
     Änderung; der Server stempelt Name und Zeit dazu. 409 = jemand war schneller. */
  function saveData(data, baseRev, summary, entries) {
    if (!hasBackend()) {
      try { localStorage.setItem(LS_DEMO, JSON.stringify(data)); } catch (e) { /* voll */ }
      return Promise.resolve({ rev: 0, demo: true });
    }
    return req('/api/data', {
      method: 'PUT',
      body: { data: data, baseRev: baseRev, summary: summary || '', entries: entries || [] }
    });
  }

  /* Code eines Affen setzen oder zurücksetzen — nur für Admins. */
  function setCode(playerId, code) {
    if (!hasBackend()) return Promise.resolve({ demo: true });
    return req('/api/codes', { method: 'POST', body: { playerId: playerId, code: code ? String(code) : null } });
  }

  function listCodes() {
    if (!hasBackend()) return Promise.resolve({ codes: {} });
    return req('/api/codes');
  }

  function resetDemo() {
    try { localStorage.removeItem(LS_DEMO); } catch (e) { /* egal */ }
  }

  window.SA_API = {
    hasBackend: hasBackend,
    base: function () { return base; },
    getToken: getToken,
    setToken: setToken,
    login: login,
    logout: logout,
    me: me,
    loadData: loadData,
    loadLog: loadLog,
    saveData: saveData,
    setCode: setCode,
    listCodes: listCodes,
    resetDemo: resetDemo
  };
})();
