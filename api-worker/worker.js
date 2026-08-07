/* Supercell API relay — deploy as a Cloudflare Worker (free tier is plenty).
 *
 * Routes:
 *   GET /coc/players/TAG   -> official Clash of Clans player payload
 *   GET /cr/players/TAG    -> official Clash Royale player payload
 * TAG without the leading '#'.
 *
 * Tokens stay here as Worker secrets, never in the browser. Upstream goes
 * through the RoyaleAPI developer proxies, so create both API keys with the
 * single whitelisted IP 45.79.218.79 (see api-worker/README.md).
 */
const UPSTREAM = {
  coc: { base: "https://cocproxy.royaleapi.dev/v1/players/%23", secret: "COC_TOKEN" },
  cr: { base: "https://proxy.royaleapi.dev/v1/players/%23", secret: "CR_TOKEN" },
};
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    const m = new URL(req.url).pathname.match(/^\/(coc|cr)\/players\/([0289PYLQGRJCUVpylqgrjcuv#%]+)$/);
    if (!m) {
      return json({ error: "Use /coc/players/TAG or /cr/players/TAG (tag without #)." }, 404);
    }
    const game = m[1];
    const tag = decodeURIComponent(m[2]).replace(/^#/, "").toUpperCase();
    const token = env[UPSTREAM[game].secret];
    if (!token) {
      return json({ error: `Worker secret ${UPSTREAM[game].secret} is not configured.` }, 500);
    }
    const upstreamUrl = UPSTREAM[game].base + tag;
    const cache = caches.default;
    const cacheKey = new Request(upstreamUrl);
    let res = await cache.match(cacheKey);
    if (!res) {
      const up = await fetch(upstreamUrl, { headers: { Authorization: "Bearer " + token } });
      res = new Response(up.body, up);
      res.headers.set("Cache-Control", "public, max-age=300");
      if (up.ok) await cache.put(cacheKey, res.clone());
    }
    res = new Response(res.body, res);
    for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
    return res;
  },
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}
