/* SpieleAffen — Cloudflare Worker (Backend)
 *
 * Öffentlich lesbar, Schreiben nur mit persönlichem Zugangs-Token.
 * Jede Änderung landet mit Name + Zeitpunkt im Protokoll — so ist
 * nachvollziehbar, wer was eingetragen oder geändert hat.
 *
 * Endpunkte:
 *   GET  /api/data            öffentlich  → {rev, updatedAt, data}
 *   GET  /api/log?limit=N     öffentlich  → {entries:[{ts,who,action,summary,auto}]}
 *   GET  /api/whoami          Token       → {name, admin}
 *   PUT  /api/data            Token       → speichert {data, baseRev, summary}; 409 bei Konflikt
 *   GET  /api/tokens          Admin       → {tokens:[{id,name,prefix,createdAt,lastUsedAt,revokedAt}]}
 *   POST /api/tokens          Admin       → {token} (wird nur einmal ausgegeben; gespeichert wird nur der Hash)
 *   POST /api/tokens/revoke   Admin       → widerruft ein Token
 *
 * Bindings (wrangler.toml): KV-Namespace SA_KV, Secret ADMIN_TOKEN.
 * Optionale Var ALLOW_ORIGIN (Default '*') schränkt CORS ein.
 */

const MAX_DOC_BYTES = 400_000;
const MAX_LOG = 500;

const EMPTY_DOC = {
  players: [],
  seasons: [],
  nights: []
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = env.ALLOW_ORIGIN || '*';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {
      if (url.pathname === '/' || url.pathname === '') {
        return json({ ok: true, service: 'SpieleAffen API' }, 200, origin);
      }
      if (url.pathname === '/api/data' && request.method === 'GET') {
        return json(await getDoc(env), 200, origin);
      }
      if (url.pathname === '/api/log' && request.method === 'GET') {
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10) || 100, MAX_LOG);
        const log = (await env.SA_KV.get('log', 'json')) || [];
        return json({ entries: log.slice(0, limit) }, 200, origin);
      }
      if (url.pathname === '/api/whoami' && request.method === 'GET') {
        const who = await authenticate(request, env);
        if (!who) return json({ error: 'Token ungültig' }, 401, origin);
        return json({ name: who.name, admin: who.admin }, 200, origin);
      }
      if (url.pathname === '/api/data' && request.method === 'PUT') {
        return await putData(request, env, origin);
      }
      if (url.pathname === '/api/tokens' && request.method === 'GET') {
        const who = await authenticate(request, env);
        if (!who) return json({ error: 'Token ungültig' }, 401, origin);
        if (!who.admin) return json({ error: 'Nur für Admins' }, 403, origin);
        const tokens = (await env.SA_KV.get('tokens', 'json')) || {};
        const list = Object.keys(tokens).map((id) => {
          const t = tokens[id];
          return { id, name: t.name, prefix: t.prefix, createdAt: t.createdAt, lastUsedAt: t.lastUsedAt || null, revokedAt: t.revokedAt || null };
        }).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        return json({ tokens: list }, 200, origin);
      }
      if (url.pathname === '/api/tokens' && request.method === 'POST') {
        return await createToken(request, env, origin);
      }
      if (url.pathname === '/api/tokens/revoke' && request.method === 'POST') {
        return await revokeToken(request, env, origin);
      }
      return json({ error: 'Nicht gefunden' }, 404, origin);
    } catch (err) {
      return json({ error: 'Serverfehler: ' + (err && err.message ? err.message : String(err)) }, 500, origin);
    }
  }
};

// ── Helpers ────────────────────────────────────────────────
function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
}

function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(origin)
    }
  });
}

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function bearer(request) {
  const h = request.headers.get('Authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

// → {name, admin, tokenId?} oder null
async function authenticate(request, env) {
  const token = bearer(request);
  if (!token) return null;

  // Admin-Token (Secret): Vergleich über Hashes
  if (env.ADMIN_TOKEN) {
    const [a, b] = await Promise.all([sha256Hex(token), sha256Hex(env.ADMIN_TOKEN)]);
    if (a === b) return { name: 'Admin', admin: true };
  }

  const tokens = (await env.SA_KV.get('tokens', 'json')) || {};
  const hash = await sha256Hex(token);
  for (const id of Object.keys(tokens)) {
    const t = tokens[id];
    if (t.hash === hash) {
      if (t.revokedAt) return null;
      // lastUsedAt höchstens einmal pro Stunde schreiben
      const now = Date.now();
      if (!t.lastUsedAt || now - Date.parse(t.lastUsedAt) > 3600_000) {
        t.lastUsedAt = new Date(now).toISOString();
        await env.SA_KV.put('tokens', JSON.stringify(tokens));
      }
      return { name: t.name, admin: false, tokenId: id };
    }
  }
  return null;
}

async function getDoc(env) {
  const doc = await env.SA_KV.get('doc', 'json');
  if (!doc) return { rev: 0, updatedAt: null, data: EMPTY_DOC };
  return doc;
}

function validateData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'data muss ein Objekt sein';
  for (const key of ['players', 'seasons', 'nights']) {
    if (!Array.isArray(data[key])) return key + ' muss eine Liste sein';
  }
  for (const p of data.players) {
    if (!p || typeof p.id !== 'string' || typeof p.name !== 'string') return 'Spieler brauchen id und name';
  }
  for (const n of data.nights) {
    if (!n || typeof n.id !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(n.date || '')) return 'Abende brauchen id und Datum (YYYY-MM-DD)';
    if (!Array.isArray(n.games)) return 'Abend ' + n.id + ': games muss eine Liste sein';
  }
  for (const s of data.seasons) {
    if (!s || typeof s.id !== 'string' || typeof s.name !== 'string') return 'Saisons brauchen id und name';
  }
  return null;
}

// Kurze automatische Zusammenfassung der Änderung fürs Protokoll —
// unabhängig davon, was der Client als summary behauptet.
function autoDiff(oldData, newData) {
  const parts = [];
  const on = (oldData.nights || []).length, nn = (newData.nights || []).length;
  const op = (oldData.players || []).length, np = (newData.players || []).length;
  const os = (oldData.seasons || []).length, ns = (newData.seasons || []).length;
  if (on !== nn) parts.push('Abende ' + on + '→' + nn);
  if (op !== np) parts.push('Spieler ' + op + '→' + np);
  if (os !== ns) parts.push('Saisons ' + os + '→' + ns);
  if (!parts.length) {
    const oldIds = new Map((oldData.nights || []).map((n) => [n.id, JSON.stringify(n)]));
    const changed = (newData.nights || []).filter((n) => oldIds.has(n.id) && oldIds.get(n.id) !== JSON.stringify(n));
    if (changed.length) parts.push(changed.length + ' Abend' + (changed.length > 1 ? 'e' : '') + ' geändert');
    else if (JSON.stringify(oldData.players) !== JSON.stringify(newData.players)) parts.push('Spielerdaten geändert');
    else if (JSON.stringify(oldData.seasons) !== JSON.stringify(newData.seasons)) parts.push('Saisons geändert');
  }
  return parts.join(', ');
}

async function appendLog(env, entry) {
  const log = (await env.SA_KV.get('log', 'json')) || [];
  log.unshift(entry);
  await env.SA_KV.put('log', JSON.stringify(log.slice(0, MAX_LOG)));
}

async function putData(request, env, origin) {
  const who = await authenticate(request, env);
  if (!who) return json({ error: 'Token ungültig' }, 401, origin);

  const raw = await request.text();
  if (raw.length > MAX_DOC_BYTES) return json({ error: 'Dokument zu groß' }, 413, origin);
  let body;
  try { body = JSON.parse(raw); } catch (e) { return json({ error: 'Ungültiges JSON' }, 400, origin); }

  const invalid = validateData(body.data);
  if (invalid) return json({ error: invalid }, 400, origin);

  const current = await getDoc(env);
  const baseRev = typeof body.baseRev === 'number' ? body.baseRev : -1;
  if (baseRev !== current.rev) {
    return json({ error: 'Konflikt: Daten wurden zwischenzeitlich geändert', rev: current.rev }, 409, origin);
  }

  const next = {
    rev: current.rev + 1,
    updatedAt: new Date().toISOString(),
    data: body.data
  };
  await env.SA_KV.put('doc', JSON.stringify(next));

  const summary = typeof body.summary === 'string' && body.summary.trim()
    ? body.summary.trim().slice(0, 200)
    : 'Daten geändert';
  await appendLog(env, {
    ts: next.updatedAt,
    who: who.name,
    action: 'data.put',
    summary,
    auto: autoDiff(current.data, body.data) || undefined,
    rev: next.rev
  });

  return json({ ok: true, rev: next.rev, updatedAt: next.updatedAt }, 200, origin);
}

async function createToken(request, env, origin) {
  const who = await authenticate(request, env);
  if (!who) return json({ error: 'Token ungültig' }, 401, origin);
  if (!who.admin) return json({ error: 'Nur für Admins' }, 403, origin);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'Ungültiges JSON' }, 400, origin); }
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 40) : '';
  if (!name) return json({ error: 'Name fehlt' }, 400, origin);

  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const token = 'sa_' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  const hash = await sha256Hex(token);
  const id = hash.slice(0, 12);

  const tokens = (await env.SA_KV.get('tokens', 'json')) || {};
  tokens[id] = {
    name,
    hash,
    prefix: token.slice(0, 8),
    createdAt: new Date().toISOString()
  };
  await env.SA_KV.put('tokens', JSON.stringify(tokens));
  await appendLog(env, {
    ts: new Date().toISOString(),
    who: who.name,
    action: 'token.create',
    summary: 'Zugang für ' + name + ' erstellt'
  });

  return json({ ok: true, token, id }, 200, origin);
}

async function revokeToken(request, env, origin) {
  const who = await authenticate(request, env);
  if (!who) return json({ error: 'Token ungültig' }, 401, origin);
  if (!who.admin) return json({ error: 'Nur für Admins' }, 403, origin);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'Ungültiges JSON' }, 400, origin); }
  const tokens = (await env.SA_KV.get('tokens', 'json')) || {};
  const t = tokens[body.id];
  if (!t) return json({ error: 'Token nicht gefunden' }, 404, origin);
  if (!t.revokedAt) {
    t.revokedAt = new Date().toISOString();
    await env.SA_KV.put('tokens', JSON.stringify(tokens));
    await appendLog(env, {
      ts: t.revokedAt,
      who: who.name,
      action: 'token.revoke',
      summary: 'Zugang von ' + t.name + ' widerrufen'
    });
  }
  return json({ ok: true }, 200, origin);
}
