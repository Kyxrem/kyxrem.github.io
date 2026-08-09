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

### Raspberry Pi walkthrough

```bash
# 1. On the Pi (Raspberry Pi OS Bookworm ships Node 18+; older OS: see below)
sudo apt update && sudo apt install -y git nodejs
node --version          # needs v18 or newer

# 2. Clone and configure
git clone https://github.com/Kyxrem/kyxrem.github.io.git
cd kyxrem.github.io/api-relay
cp .env.example .env
nano .env               # paste COC_TOKEN and CR_TOKEN

# 3. Test run
node server.js          # then open http://<pi-lan-ip>:8901/clash/ from another device

# 4. Run on boot
sudo cp supercell-relay.service /etc/systemd/system/   # adjust paths/User inside if needed
sudo systemctl daemon-reload
sudo systemctl enable --now supercell-relay
systemctl status supercell-relay                        # journalctl -u supercell-relay -f for logs
```

If `node --version` is older than 18 (32-bit Bullseye ships v12):
`curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs`

Give the Pi a fixed LAN address (DHCP reservation in the router) and, for
access from outside your network, forward one TCP port (8901) to it. The IP
to whitelist in both developer portals is your home's public IP —
`curl ifconfig.me` on the Pi. To update later:
`cd ~/kyxrem.github.io && git pull && sudo systemctl restart supercell-relay`

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
