/* SpieleAffen — api.js
 * Datenzugriff: Cloudflare-Worker-Backend (wenn konfiguriert) oder Demo-Daten.
 * Lesen ist öffentlich; Schreiben nur mit persönlichem Zugangs-Token (edit.html).
 */
(function () {
  'use strict';

  var cfg = (window.SPIELEAFFEN_CONFIG || {});
  var base = (cfg.apiBase || '').replace(/\/+$/, '');
  var LS_CACHE = 'sa_data_cache_v1';
  var LS_TOKEN = 'sa_token_v1';

  function hasBackend() { return !!base; }

  function req(path, opts) {
    opts = opts || {};
    var headers = opts.headers || {};
    if (opts.token) headers['Authorization'] = 'Bearer ' + opts.token;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(base + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      return r.text().then(function (txt) {
        var json = null;
        try { json = txt ? JSON.parse(txt) : null; } catch (e) { /* leer */ }
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

  // ── Lesen ────────────────────────────────────────────────
  // → {data, rev, updatedAt, source: 'remote'|'cache'|'demo'}
  function loadData() {
    if (!hasBackend()) {
      return Promise.resolve({ data: window.SA_DEMO_DATA, rev: 0, updatedAt: null, source: 'demo' });
    }
    return req('/api/data').then(function (res) {
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
    return req('/api/log' + (limit ? '?limit=' + limit : ''));
  }

  // ── Token / Schreiben ────────────────────────────────────
  function getToken() { try { return localStorage.getItem(LS_TOKEN) || ''; } catch (e) { return ''; } }
  function setToken(t) { try { t ? localStorage.setItem(LS_TOKEN, t) : localStorage.removeItem(LS_TOKEN); } catch (e) { /* egal */ } }

  function whoami(token) {
    return req('/api/whoami', { token: token || getToken() });
  }

  // Speichert das komplette Dokument; summary beschreibt die Änderung fürs Protokoll.
  function saveData(data, baseRev, summary) {
    return req('/api/data', {
      method: 'PUT',
      token: getToken(),
      body: { data: data, baseRev: baseRev, summary: summary }
    });
  }

  // ── Admin ────────────────────────────────────────────────
  function listTokens() { return req('/api/tokens', { token: getToken() }); }
  function createToken(name) { return req('/api/tokens', { method: 'POST', token: getToken(), body: { name: name } }); }
  function revokeToken(id) { return req('/api/tokens/revoke', { method: 'POST', token: getToken(), body: { id: id } }); }

  window.SA_API = {
    hasBackend: hasBackend,
    base: function () { return base; },
    loadData: loadData,
    loadLog: loadLog,
    getToken: getToken,
    setToken: setToken,
    whoami: whoami,
    saveData: saveData,
    listTokens: listTokens,
    createToken: createToken,
    revokeToken: revokeToken
  };
})();
