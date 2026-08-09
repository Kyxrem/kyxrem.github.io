#!/usr/bin/env node
/* Self-hosted Supercell API relay — zero dependencies, Node 18+.
 *
 *   node server.js
 *
 * Tokens live in api-relay/.env (copy .env.example, git-ignored); real
 * environment variables take precedence. Routes:
 *
 *   GET /coc/players/TAG   -> official Clash of Clans player payload
 *   GET /cr/players/TAG    -> official Clash Royale player payload
 *
 * Everything else serves the repo as a static site (SERVE_SITE=0 disables),
 * so browsing http://your-host:8901/clash/ needs no CORS or HTTPS setup.
 */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

// ---- .env loader (real env vars win) ----
const envFile = path.join(__dirname, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith("#") && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const PORT = Number(process.env.PORT || 8901);
const HOST = process.env.HOST || "0.0.0.0";
const ALLOW = process.env.ALLOW_ORIGIN || "*";
const PROXY = process.env.USE_ROYALEAPI_PROXY === "1";
const SERVE = process.env.SERVE_SITE !== "0";
const SITE = path.resolve(process.env.SITE_DIR || path.join(__dirname, ".."));
const TTL_MS = Number(process.env.CACHE_SECONDS || 300) * 1000;
const TOKENS = { coc: process.env.COC_TOKEN || "", cr: process.env.CR_TOKEN || "" };
const UPSTREAM = {
  coc: process.env.UPSTREAM_COC || (PROXY ? "https://cocproxy.royaleapi.dev" : "https://api.clashofclans.com"),
  cr: process.env.UPSTREAM_CR || (PROXY ? "https://proxy.royaleapi.dev" : "https://api.clashroyale.com"),
};

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json",
  ".md": "text/plain; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".ico": "image/x-icon",
};
const cache = new Map(); // upstream url -> { t, status, body }

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOW,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
  };
}
function sendJson(res, status, obj) {
  res.writeHead(status, { ...corsHeaders(), "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}
function sendBody(res, status, body, cached) {
  res.writeHead(status, {
    ...corsHeaders(),
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=" + Math.floor(TTL_MS / 1000),
    "X-Relay-Cache": cached ? "hit" : "miss",
  });
  res.end(body);
}

async function handleApi(res, game, rawTag) {
  const token = TOKENS[game];
  if (!token) {
    return sendJson(res, 500, {
      error: `${game.toUpperCase()}_TOKEN is not set — put it in api-relay/.env (see .env.example).`,
    });
  }
  const tag = decodeURIComponent(rawTag).replace(/^#/, "").toUpperCase();
  if (!/^[0289PYLQGRJCUV]{3,}$/.test(tag)) {
    return sendJson(res, 400, { error: `"${tag}" doesn't look like a player tag.` });
  }
  const url = `${UPSTREAM[game]}/v1/players/%23${tag}`;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.t < TTL_MS) return sendBody(res, hit.status, hit.body, true);
  try {
    const up = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const body = await up.text();
    if (up.status !== 429) cache.set(url, { t: Date.now(), status: up.status, body });
    return sendBody(res, up.status, body, false);
  } catch (e) {
    return sendJson(res, 502, { error: "Upstream unreachable: " + e.message });
  }
}

function serveStatic(req, res, pathname) {
  let p = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  let fp = path.join(SITE, p);
  if (!fp.startsWith(SITE)) { res.writeHead(403); return res.end(); }
  try {
    if (fs.statSync(fp).isDirectory()) fp = path.join(fp, "index.html");
  } catch (e) { /* fall through to readFile error */ }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" });
    res.end(data);
  });
}

http.createServer((req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, corsHeaders()); return res.end(); }
  if (req.method !== "GET") { res.writeHead(405, corsHeaders()); return res.end(); }
  const u = new URL(req.url, "http://relay");
  const m = u.pathname.match(/^\/(coc|cr)\/players\/([^/]+)$/);
  if (m) return handleApi(res, m[1], m[2]);
  if (SERVE) return serveStatic(req, res, u.pathname);
  sendJson(res, 404, { error: "Routes: /coc/players/TAG and /cr/players/TAG" });
}).listen(PORT, HOST, () => {
  console.log(`Supercell API relay listening on http://${HOST}:${PORT}`);
  console.log(`  COC_TOKEN: ${TOKENS.coc ? "configured" : "MISSING"} | CR_TOKEN: ${TOKENS.cr ? "configured" : "MISSING"}`);
  console.log(`  upstream: ${UPSTREAM.coc} / ${UPSTREAM.cr}${PROXY ? " (via RoyaleAPI proxy)" : " (direct — whitelist this host's public IP)"}`);
  console.log(`  static site: ${SERVE ? SITE : "disabled"}`);
});
