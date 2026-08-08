/* SpieleAffen — Cloudflare Worker (Modus 'worker', die härtere Variante).
   Personen-Tokens sind beliebige Strings (admin.html → Generieren); nur der Worker
   kennt das GitHub-Token und kann ausschließlich data.json im Repo schreiben.

   Deploy (einmalig, ~10 Minuten):
     1. dash.cloudflare.com → Workers & Pages → Create Worker → Code durch diese Datei ersetzen
     2. Settings → Variables → Secret: GITHUB_TOKEN = Fine-grained PAT (nur dieses Repo,
        Contents: Read and write)
     3. Deploy. Worker-URL in spieleaffen/config.js eintragen: mode:'worker', workerUrl:'https://…'
   Endpunkte: GET /data · GET /whoami (Bearer) · PUT /data (Bearer)
   Tokens werden gegen data/tokens.json im Repo geprüft (nur SHA-256-Hashes dort). */

const OWNER = 'Kyxrem';
const REPO = 'kyxrem.github.io';
const BRANCH = 'main';
const DATA_PATH = 'spieleaffen/data/data.json';
const TOKENS_PATH = 'spieleaffen/data/tokens.json';
const ALLOWED_ORIGIN = '*'; // enger stellen: 'https://kyxrem.github.io'
const MAX_BYTES = 1_000_000;

let tokenCache = { at: 0, map: null };
const writeLog = new Map(); // hash -> [timestamps], simples Rate-Limit

function cors(extra = {}) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    'Cache-Control': 'no-store',
    ...extra
  };
}
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: cors({ 'Content-Type': 'application/json' }) });

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function gh(env, path, init = {}) {
  return fetch('https://api.github.com' + path, {
    ...init,
    headers: {
      Authorization: 'Bearer ' + env.GITHUB_TOKEN,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'spieleaffen-worker',
      ...(init.headers || {})
    }
  });
}

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

async function getFile(env, path) {
  const res = await gh(env, `/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}&t=${Date.now()}`);
  if (!res.ok) throw new Error('GitHub read ' + res.status);
  const body = await res.json();
  return { json: JSON.parse(b64decodeUtf8(body.content)), sha: body.sha };
}

async function resolveToken(env, req) {
  const auth = req.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;
  const now = Date.now();
  if (!tokenCache.map || now - tokenCache.at > 60_000) {
    const { json: reg } = await getFile(env, TOKENS_PATH);
    tokenCache = { at: now, map: reg.tokens || {} };
  }
  const hash = await sha256(token);
  const entry = tokenCache.map[hash];
  if (!entry || entry.active === false) return null;
  return { name: entry.name, hash };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });

    try {
      if (req.method === 'GET' && url.pathname === '/data') {
        const file = await getFile(env, DATA_PATH);
        return json(file);
      }

      if (req.method === 'GET' && url.pathname === '/whoami') {
        const who = await resolveToken(env, req);
        if (!who) return json({ error: 'Token unbekannt oder gesperrt.' }, 401);
        return json({ name: who.name });
      }

      if (req.method === 'PUT' && url.pathname === '/data') {
        const who = await resolveToken(env, req);
        if (!who) return json({ error: 'Token unbekannt oder gesperrt.' }, 401);

        // Rate-Limit: 40 Schreibvorgänge pro Stunde und Person (best effort)
        const now = Date.now();
        const log = (writeLog.get(who.hash) || []).filter((t) => now - t < 3600_000);
        if (log.length >= 40) return json({ error: 'Langsam, Affe. Zu viele Änderungen pro Stunde.' }, 429);
        log.push(now); writeLog.set(who.hash, log);

        const body = await req.json();
        if (!body || typeof body.json !== 'object' || body.json === null) return json({ error: 'json fehlt.' }, 400);
        const content = JSON.stringify(body.json, null, 2) + '\n';
        if (content.length > MAX_BYTES) return json({ error: 'data.json zu groß.' }, 413);
        const message = String(body.message || 'Änderung').slice(0, 180);
        const slug = who.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

        const res = await gh(env, `/repos/${OWNER}/${REPO}/contents/${DATA_PATH}`, {
          method: 'PUT',
          body: JSON.stringify({
            message: 'SpieleAffen · ' + who.name + ': ' + message,
            branch: BRANCH,
            content: b64encodeUtf8(content),
            sha: body.sha || undefined,
            committer: { name: who.name + ' (SpieleAffen)', email: slug + '@spieleaffen.local' },
            author: { name: who.name + ' (SpieleAffen)', email: slug + '@spieleaffen.local' }
          })
        });
        if (res.status === 409 || res.status === 422) return json({ error: 'conflict' }, 409);
        if (!res.ok) return json({ error: 'GitHub write ' + res.status }, 502);
        return json({ ok: true, by: who.name });
      }

      return json({ error: 'Kenn ich nicht.' }, 404);
    } catch (e) {
      return json({ error: String((e && e.message) || e) }, 500);
    }
  }
};
