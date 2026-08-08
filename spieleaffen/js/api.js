/* SpieleAffen API-Schicht.
   Lesen: same-origin data.json (mit Cache-Buster), Fallback raw.githubusercontent / Worker.
   Schreiben: GitHub Contents API (mode 'github') oder Cloudflare Worker (mode 'worker').
   Jede Änderung: Commit mit Personen-Attribution + Audit-Eintrag in data.json. */
(function (root) {
  'use strict';
  const C = () => root.SA_CONFIG;
  const API = {};

  /* ---------- Krypto/Encoding ---------- */
  API.sha256 = async function (str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  };
  function b64encodeUtf8(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64decodeUtf8(b64) {
    const bin = atob(b64.replace(/\n/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  /* ---------- Demo-Modus ---------- */
  API.isDemo = () => new URLSearchParams(location.search).has('demo');
  API.demoLink = (page) => page + '?demo';

  /* ---------- Lesen ---------- */
  async function fetchJson(url, opts) {
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error('HTTP ' + res.status + ' für ' + url);
    return res.json();
  }
  API.loadData = async function () {
    if (API.isDemo()) return structuredClone(root.SA_DEMO);
    const cfg = C();
    try {
      return await fetchJson('data/data.json?v=' + Date.now(), { cache: 'no-store' });
    } catch (e) {
      if (cfg.mode === 'worker' && cfg.workerUrl) {
        const r = await fetchJson(cfg.workerUrl.replace(/\/$/, '') + '/data');
        return r.json ?? r;
      }
      return fetchJson('https://raw.githubusercontent.com/' + cfg.owner + '/' + cfg.repo + '/' + cfg.branch + '/' + cfg.dataPath + '?v=' + Date.now(), { cache: 'no-store' });
    }
  };
  API.loadTokens = async function () {
    try {
      return await fetchJson('data/tokens.json?v=' + Date.now(), { cache: 'no-store' });
    } catch (e) {
      const cfg = C();
      return fetchJson('https://raw.githubusercontent.com/' + cfg.owner + '/' + cfg.repo + '/' + cfg.branch + '/' + cfg.tokensPath + '?v=' + Date.now(), { cache: 'no-store' });
    }
  };

  /* ---------- Session ---------- */
  const LS_KEY = 'spieleaffen.session';
  API.session = function () {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || null; } catch (e) { return null; }
  };
  API.setSession = function (s) {
    if (s) localStorage.setItem(LS_KEY, JSON.stringify(s));
    else localStorage.removeItem(LS_KEY);
  };

  /* Token prüfen -> {name} oder Fehler werfen */
  API.whoami = async function (token) {
    const cfg = C();
    token = token.trim();
    if (!token) throw new Error('Kein Token eingegeben.');
    if (cfg.mode === 'worker' && cfg.workerUrl) {
      const res = await fetch(cfg.workerUrl.replace(/\/$/, '') + '/whoami', { headers: { Authorization: 'Bearer ' + token } });
      if (res.status === 401 || res.status === 403) throw new Error('Token unbekannt oder deaktiviert.');
      if (!res.ok) throw new Error('Worker nicht erreichbar (HTTP ' + res.status + ').');
      return res.json();
    }
    const hash = await API.sha256(token);
    const reg = await API.loadTokens();
    const entry = (reg.tokens || {})[hash];
    if (!entry) throw new Error('Token unbekannt. Frag den Verwalter der Runde.');
    if (entry.active === false) throw new Error('Dieses Token wurde deaktiviert.');
    return { name: entry.name, hash };
  };

  /* ---------- Schreiben ---------- */
  function ghHeaders(token) {
    return {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }
  async function ghGetFile(path, token) {
    const cfg = C();
    const url = 'https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo + '/contents/' + path + '?ref=' + cfg.branch + '&t=' + Date.now();
    const res = await fetch(url, { headers: ghHeaders(token), cache: 'no-store' });
    if (res.status === 401) throw new Error('GitHub lehnt das Token ab (401). Ist es abgelaufen?');
    if (res.status === 404) return { json: null, sha: null };
    if (!res.ok) throw new Error('GitHub-Fehler beim Lesen (HTTP ' + res.status + ').');
    const body = await res.json();
    return { json: JSON.parse(b64decodeUtf8(body.content)), sha: body.sha };
  }
  async function ghPutFile(path, token, json, sha, message, who) {
    const cfg = C();
    const slug = who.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const payload = {
      message, branch: cfg.branch,
      content: b64encodeUtf8(JSON.stringify(json, null, 2) + '\n'),
      committer: { name: who + ' (SpieleAffen)', email: slug + '@spieleaffen.local' },
      author: { name: who + ' (SpieleAffen)', email: slug + '@spieleaffen.local' }
    };
    if (sha) payload.sha = sha;
    const res = await fetch('https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo + '/contents/' + path, {
      method: 'PUT', headers: ghHeaders(token), body: JSON.stringify(payload)
    });
    if (res.status === 409 || res.status === 422) { const e = new Error('conflict'); e.conflict = true; throw e; }
    if (res.status === 401 || res.status === 403) throw new Error('GitHub lehnt das Token ab (HTTP ' + res.status + '). Rechte prüfen: Contents → Read and write.');
    if (!res.ok) throw new Error('GitHub-Fehler beim Speichern (HTTP ' + res.status + ').');
    return res.json();
  }

  /* Zentrale Speicherfunktion:
     mutator(data) verändert die frisch geladenen Daten; bei Konflikt wird
     einmal neu geladen und der mutator erneut angewendet. */
  API.saveData = async function ({ token, who, message, mutator }) {
    if (API.isDemo()) throw new Error('Demo-Modus: Speichern ist hier aus. Ohne ?demo öffnen.');
    const cfg = C();
    const stamp = new Date().toISOString().slice(0, 16) + 'Z';

    async function attempt() {
      let current, sha = null;
      if (cfg.mode === 'worker' && cfg.workerUrl) {
        const res = await fetch(cfg.workerUrl.replace(/\/$/, '') + '/data?t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) throw new Error('Worker nicht erreichbar (HTTP ' + res.status + ').');
        const body = await res.json();
        current = body.json; sha = body.sha;
      } else {
        const got = await ghGetFile(cfg.dataPath, token);
        current = got.json; sha = got.sha;
        if (!current) throw new Error('data.json nicht gefunden — Pfad in config.js prüfen.');
      }
      mutator(current);
      current.audit = current.audit || [];
      current.audit.unshift({ t: stamp, who, msg: message });
      if (current.audit.length > 400) current.audit.length = 400;

      const commitMsg = 'SpieleAffen · ' + who + ': ' + message;
      if (cfg.mode === 'worker' && cfg.workerUrl) {
        const res = await fetch(cfg.workerUrl.replace(/\/$/, '') + '/data', {
          method: 'PUT',
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ json: current, sha, message })
        });
        if (res.status === 409) { const e = new Error('conflict'); e.conflict = true; throw e; }
        if (res.status === 401 || res.status === 403) throw new Error('Token unbekannt oder deaktiviert.');
        if (!res.ok) throw new Error('Worker-Fehler beim Speichern (HTTP ' + res.status + ').');
        return res.json();
      }
      return ghPutFile(cfg.dataPath, token, current, sha, commitMsg, who);
    }

    try { return await attempt(); }
    catch (e) {
      if (e.conflict) return attempt(); // jemand war schneller -> frisch laden, nochmal
      throw e;
    }
  };

  /* tokens.json schreiben (nur Verwaltung, mode 'github') */
  API.saveTokens = async function ({ ownerToken, who, message, mutator }) {
    const cfg = C();
    async function attempt() {
      const got = await ghGetFile(cfg.tokensPath, ownerToken);
      const current = got.json || { tokens: {} };
      mutator(current);
      return ghPutFile(cfg.tokensPath, ownerToken, current, got.sha, 'SpieleAffen · ' + who + ': ' + message, who);
    }
    try { return await attempt(); }
    catch (e) { if (e.conflict) return attempt(); throw e; }
  };

  root.API = API;
})(window);
