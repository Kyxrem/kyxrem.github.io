/* SpieleAffen — Cloudflare Worker (Backend)
 *
 * Lesen ist öffentlich, Schreiben braucht eine Sitzung, und eine Sitzung
 * bekommt man mit den eigenen vier Ziffern. Deshalb steht in jedem Log-Eintrag
 * ein Name und nicht nur „Admin".
 *
 * Endpunkte:
 *   GET  /api/data          öffentlich → {rev, updatedAt, data}
 *   GET  /api/log?limit=N   öffentlich → {entries:[…]}   — der Block ist einsehbar
 *   POST /api/login         Code       → {token, player}; 401 falsch, 429 zu oft
 *   POST /api/logout        Token      → beendet die Sitzung
 *   GET  /api/me            Token      → {id, name, admin}
 *   PUT  /api/data          Token      → {data, baseRev, summary, entries}; 409 bei Konflikt
 *   GET  /api/codes         Admin      → {codes:{playerId:true}} — nur wer einen hat, nie welchen
 *   POST /api/codes         Admin      → setzt oder löscht den Code eines Affen
 *
 * Bindings (wrangler.toml): KV-Namespace SA_KV, Secret ADMIN_TOKEN.
 * Optionale Var ALLOW_ORIGIN (Default '*') schränkt CORS ein.
 *
 * ── Zur Sicherheit der vier Ziffern ──────────────────────────────────────
 * Vier Ziffern sind zehntausend Möglichkeiten. Das ist schwach, und es soll
 * hier auch nichts Wertvolleres schützen als eine Punktetabelle unter Freunden.
 * Zwei Dinge machen es trotzdem ordentlich:
 *
 *   1. Gespeichert wird nie der Code, sondern PBKDF2-SHA256 mit 100.000
 *      Runden und eigenem Salt je Affe. Wer die KV-Datenbank in die Hand
 *      bekommt, braucht selbst für zehntausend Kandidaten spürbar Rechenzeit.
 *   2. Geraten wird nicht: nach VERSUCHE_MAX falschen Codes ist die IP für
 *      SPERRE_MIN Minuten draußen. Das ist die eigentliche Verteidigung.
 *
 * Wer mehr braucht, nimmt längere Codes — LAENGE_MIN unten anheben genügt.
 */

const MAX_DOC_BYTES = 400_000;
const MAX_LOG = 500;
const PBKDF2_RUNDEN = 100_000;
const SITZUNG_TAGE = 30;
const VERSUCHE_MAX = 6;
const SPERRE_MIN = 15;
const LAENGE_MIN = 4;

const LEERES_DOKUMENT = {
  meta: { version: 1 },
  players: [],
  seasons: [],
  games: [],
  nights: [],
  modules: { catan: { sessions: [] }, wizard: { sessions: [] } },
  houseRules: []
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = env.ALLOW_ORIGIN || '*';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {
      const route = request.method + ' ' + url.pathname;
      switch (route) {
        case 'GET /':
        case 'GET ':
          return json({ ok: true, service: 'SpieleAffen API' }, 200, origin);

        case 'GET /api/data':
          return json(await ladeDokument(env), 200, origin);

        case 'GET /api/log': {
          const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10) || 100, MAX_LOG);
          const log = (await env.SA_KV.get('log', 'json')) || [];
          return json({ entries: log.slice(0, limit) }, 200, origin);
        }

        case 'POST /api/login':   return await anmelden(request, env, origin);
        case 'POST /api/logout':  return await abmelden(request, env, origin);
        case 'GET /api/me':       return await werBinIch(request, env, origin);
        case 'PUT /api/data':     return await speichern(request, env, origin);
        case 'GET /api/codes':    return await codesLesen(request, env, origin);
        case 'POST /api/codes':   return await codeSetzen(request, env, origin);
      }
      return json({ error: 'Nicht gefunden' }, 404, origin);
    } catch (err) {
      return json({ error: 'Serverfehler: ' + (err && err.message ? err.message : String(err)) }, 500, origin);
    }
  }
};

// ── Grundlagen ─────────────────────────────────────────────────────────────
function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin || '*') }
  });
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function zufall(bytes) {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)));
}

/* Konstante Laufzeit — ein Vergleich, der bei der ersten Abweichung abbricht,
   verrät über die Zeit, wie viele Zeichen stimmten. */
function gleich(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function ableiten(code, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: PBKDF2_RUNDEN },
    key, 256
  );
  return hex(bits);
}

// ── Dokument ───────────────────────────────────────────────────────────────
async function ladeDokument(env) {
  const gespeichert = await env.SA_KV.get('doc', 'json');
  return gespeichert || { rev: 0, updatedAt: null, data: LEERES_DOKUMENT };
}

// ── Sperre gegen Raten ─────────────────────────────────────────────────────
function ipVon(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unbekannt';
}

async function gesperrt(env, ip) {
  const eintrag = await env.SA_KV.get('rl:' + ip, 'json');
  return !!(eintrag && eintrag.versuche >= VERSUCHE_MAX);
}

async function fehlversuch(env, ip) {
  const eintrag = (await env.SA_KV.get('rl:' + ip, 'json')) || { versuche: 0 };
  eintrag.versuche += 1;
  await env.SA_KV.put('rl:' + ip, JSON.stringify(eintrag), { expirationTtl: SPERRE_MIN * 60 });
}

async function sperreLoesen(env, ip) {
  await env.SA_KV.delete('rl:' + ip);
}

// ── Anmelden ───────────────────────────────────────────────────────────────
async function anmelden(request, env, origin) {
  const ip = ipVon(request);
  if (await gesperrt(env, ip)) {
    return json({ error: 'Zu viele Versuche. In ' + SPERRE_MIN + ' Minuten nochmal.' }, 429, origin);
  }

  const body = await request.json().catch(() => ({}));
  const code = String(body.code || '');
  if (code.length < LAENGE_MIN) return json({ error: 'Code zu kurz' }, 400, origin);

  // Der Admin-Schlüssel aus den Secrets kommt immer rein — damit sich die
  // Runde nicht selbst aussperren kann und der allererste Affe angelegt
  // werden kann, bevor es überhaupt Codes gibt.
  if (env.ADMIN_TOKEN && gleich(code, env.ADMIN_TOKEN)) {
    await sperreLoesen(env, ip);
    const player = { id: null, name: 'Admin', admin: true };
    return json({ token: await sitzungAnlegen(env, player), player }, 200, origin);
  }

  const codes = (await env.SA_KV.get('codes', 'json')) || {};
  const doc = await ladeDokument(env);

  for (const playerId of Object.keys(codes)) {
    const eintrag = codes[playerId];
    if (!eintrag || !eintrag.salt || !eintrag.hash) continue;
    const kandidat = await ableiten(code, eintrag.salt);
    if (!gleich(kandidat, eintrag.hash)) continue;

    const spieler = (doc.data.players || []).filter((p) => p.id === playerId)[0];
    if (!spieler || spieler.archived) break;   // archivierte Affen kommen nicht rein
    await sperreLoesen(env, ip);
    const player = { id: spieler.id, name: spieler.name, admin: !!spieler.admin };
    return json({ token: await sitzungAnlegen(env, player), player }, 200, origin);
  }

  await fehlversuch(env, ip);
  return json({ error: 'Code stimmt nicht' }, 401, origin);
}

async function sitzungAnlegen(env, player) {
  const token = zufall(32);
  await env.SA_KV.put('sess:' + token, JSON.stringify(player), { expirationTtl: SITZUNG_TAGE * 86400 });
  return token;
}

async function sitzung(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;
  const roh = await env.SA_KV.get('sess:' + token, 'json');
  if (!roh) return null;
  return { ...roh, token };
}

async function abmelden(request, env, origin) {
  const wer = await sitzung(request, env);
  if (wer) await env.SA_KV.delete('sess:' + wer.token);
  return json({ ok: true }, 200, origin);
}

async function werBinIch(request, env, origin) {
  const wer = await sitzung(request, env);
  if (!wer) return json({ error: 'Keine Sitzung' }, 401, origin);
  return json({ id: wer.id, name: wer.name, admin: !!wer.admin }, 200, origin);
}

// ── Speichern ──────────────────────────────────────────────────────────────
async function speichern(request, env, origin) {
  const wer = await sitzung(request, env);
  if (!wer) return json({ error: 'Nicht angemeldet' }, 401, origin);

  const body = await request.json().catch(() => null);
  if (!body || typeof body.data !== 'object' || body.data === null) {
    return json({ error: 'Kein Dokument im Rumpf' }, 400, origin);
  }

  const roh = JSON.stringify(body.data);
  if (roh.length > MAX_DOC_BYTES) {
    return json({ error: 'Dokument zu groß (' + roh.length + ' Bytes, erlaubt sind ' + MAX_DOC_BYTES + ')' }, 413, origin);
  }

  const aktuell = await ladeDokument(env);
  if (body.baseRev != null && Number(body.baseRev) !== Number(aktuell.rev)) {
    return json({ error: 'Jemand anderes war schneller', rev: aktuell.rev }, 409, origin);
  }

  const rev = Number(aktuell.rev || 0) + 1;
  const updatedAt = new Date().toISOString();
  await env.SA_KV.put('doc', JSON.stringify({ rev, updatedAt, data: body.data }));

  // Log: die Zeilen vom Client, aber Name und Zeit setzt der Server.
  const eintraege = Array.isArray(body.entries) ? body.entries.slice(0, 20) : [];
  const zusammenfassung = String(body.summary || '').slice(0, 200);
  const log = (await env.SA_KV.get('log', 'json')) || [];
  const neu = (eintraege.length ? eintraege : [{ text: zusammenfassung || 'Daten geändert' }]).map((e) => ({
    text: String(e.text || zusammenfassung || 'Daten geändert').slice(0, 200),
    from: e.from != null ? String(e.from).slice(0, 60) : undefined,
    to: e.to != null ? String(e.to).slice(0, 60) : undefined,
    icon: String(e.icon || 'history').slice(0, 40),
    tone: ['neutral', 'slime', 'banana', 'punsch', 'eis'].includes(e.tone) ? e.tone : 'neutral',
    actor: wer.name,
    time: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }),
    ts: updatedAt,
    rev
  }));
  await env.SA_KV.put('log', JSON.stringify(neu.concat(log).slice(0, MAX_LOG)));

  return json({ rev, updatedAt }, 200, origin);
}

// ── Codes ──────────────────────────────────────────────────────────────────
async function codesLesen(request, env, origin) {
  const wer = await sitzung(request, env);
  if (!wer) return json({ error: 'Nicht angemeldet' }, 401, origin);
  if (!wer.admin) return json({ error: 'Nur für Admins' }, 403, origin);
  const codes = (await env.SA_KV.get('codes', 'json')) || {};
  // Nur, WER einen Code hat. Nie den Code und nie den Hash.
  const wers = {};
  Object.keys(codes).forEach((id) => { wers[id] = true; });
  return json({ codes: wers }, 200, origin);
}

async function codeSetzen(request, env, origin) {
  const wer = await sitzung(request, env);
  if (!wer) return json({ error: 'Nicht angemeldet' }, 401, origin);
  if (!wer.admin) return json({ error: 'Nur für Admins' }, 403, origin);

  const body = await request.json().catch(() => ({}));
  const playerId = String(body.playerId || '');
  if (!playerId) return json({ error: 'Welcher Affe?' }, 400, origin);

  const doc = await ladeDokument(env);
  if (!(doc.data.players || []).some((p) => p.id === playerId)) {
    return json({ error: 'Diesen Affen gibt es nicht' }, 404, origin);
  }

  const codes = (await env.SA_KV.get('codes', 'json')) || {};

  if (body.code === null || body.code === '') {
    delete codes[playerId];
    await env.SA_KV.put('codes', JSON.stringify(codes));
    return json({ ok: true, gesetzt: false }, 200, origin);
  }

  const code = String(body.code);
  if (!/^\d+$/.test(code) || code.length < LAENGE_MIN) {
    return json({ error: 'Mindestens ' + LAENGE_MIN + ' Ziffern' }, 400, origin);
  }

  const salt = zufall(16);
  codes[playerId] = { salt, hash: await ableiten(code, salt), setztAm: new Date().toISOString() };
  await env.SA_KV.put('codes', JSON.stringify(codes));
  return json({ ok: true, gesetzt: true }, 200, origin);
}
