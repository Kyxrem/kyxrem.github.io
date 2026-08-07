# Self-hosted Supercell API relay

A single-file Node server (no dependencies) that lets the analyzers fetch
your profiles with **just a player tag**. It holds your API tokens at home,
calls Supercell's APIs directly from your static IP, adds CORS, and caches
responses for 5 minutes. It can also serve this repo as the website itself,
which sidesteps HTTPS/mixed-content concerns entirely.

## Where the tokens go  ← the important part

```bash
cd api-relay
cp .env.example .env
nano .env        # paste your two tokens
```

`.env` is **git-ignored** — the tokens stay on your machine.

Create the tokens (both free, one minute each), whitelisting **your static
home IP** in both:

- Clash of Clans: <https://developer.clashofclans.com> → My Account →
  Create New Key → *Allowed IP addresses* = your static IP
- Clash Royale: <https://developer.clashroyale.com> → same steps

(Your public IP: `curl ifconfig.me` from the machine that will run the relay.)

## Run it

```bash
node api-relay/server.js
# Supercell API relay listening on http://0.0.0.0:8901
```

Two ways to use it:

1. **Let the relay serve the site** (default): open
   `http://YOUR-HOST:8901/clash/` and `http://YOUR-HOST:8901/royale/` —
   same origin, no CORS, works from your phone on the LAN or via your
   port-forward. The *Relay URL* field can stay empty‑ish: enter
   `http://YOUR-HOST:8901`.
2. **Keep using GitHub Pages** for the site: enter the relay URL in each
   tool's *Import / Export → Relay URL* field. Note the Pages site is HTTPS,
   so browsers only allow the relay to be `http://localhost:...` (fine when
   browsing on the same machine) or an HTTPS URL — put the relay behind
   your reverse proxy (Caddy/nginx/Traefik) if you want phone + Pages.

### Keep it running (systemd)

```ini
# /etc/systemd/system/supercell-relay.service
[Unit]
Description=Supercell API relay
After=network-online.target
[Service]
ExecStart=/usr/bin/node /path/to/kyxrem.github.io/api-relay/server.js
Restart=on-failure
User=youruser
[Install]
WantedBy=multi-user.target
```

### Or Docker

```yaml
services:
  supercell-relay:
    build: ./api-relay
    ports: ["8901:8901"]
    env_file: ./api-relay/.env
    volumes: ["./:/site:ro"]      # lets the relay serve the site
    restart: unless-stopped
```

## Options (env vars or `.env`)

| Var | Default | Meaning |
|---|---|---|
| `COC_TOKEN` / `CR_TOKEN` | — | your API tokens (required) |
| `PORT` | `8901` | listen port |
| `ALLOW_ORIGIN` | `*` | CORS origin, e.g. `https://kyxrem.github.io` |
| `SERVE_SITE` | `1` | serve the repo as a website too |
| `CACHE_SECONDS` | `300` | response cache TTL |
| `USE_ROYALEAPI_PROXY` | `0` | set `1` if you ever lose the static IP — then whitelist `45.79.218.79` in your keys instead |

Routes: `GET /coc/players/TAG` and `GET /cr/players/TAG` (tag with or
without `#`, URL-encoded `%23` is fine). Nothing else is proxied.
