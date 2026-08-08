# SpieleAffen — Deployment

The app has two parts:

| Part | What | Where | Cost |
|---|---|---|---|
| Frontend | Static app (`spieleaffen/`) — read-only main page + token-gated edit page | GitHub Pages (this repo) | free |
| Backend | `worker/worker.js` — data storage, personal access tokens, audit log | Cloudflare Worker + KV | free tier |

Until the backend is configured, the main page runs on built-in demo data and
shows a red **DEMO-DATEN** badge; the edit page shows setup instructions instead
of the login. Nothing breaks without the backend — it just isn't shared/editable yet.

## 1. Frontend — GitHub Pages

Merge this branch into `main`. Since this repo is `kyxrem.github.io`, GitHub
Pages serves it automatically:

- Main page (read-only): **https://kyxrem.github.io/spieleaffen/**
- Edit page (token required): **https://kyxrem.github.io/spieleaffen/edit.html**

## 2. Backend — Cloudflare Worker (one-time, ~10 minutes)

You need a free Cloudflare account and Node.js.

```bash
cd spieleaffen/worker

# 1. Log in to Cloudflare
npx wrangler login

# 2. Create the KV namespace and paste the printed id into wrangler.toml
npx wrangler kv namespace create SA_KV

# 3. Set your admin secret (pick something long and random; keep it private)
npx wrangler secret put ADMIN_TOKEN

# 4. Deploy — prints your API URL, e.g. https://spieleaffen.<account>.workers.dev
npx wrangler deploy
```

## 3. Connect the frontend to the backend

Edit `spieleaffen/config.js`:

```js
window.SPIELEAFFEN_CONFIG = {
  apiBase: 'https://spieleaffen.<account>.workers.dev'
};
```

Commit and push. Done — the main page now shows a green **LIVE** badge.

## 4. Create personal access tokens (one per person)

1. Open `…/spieleaffen/edit.html` and log in with your **ADMIN_TOKEN**.
2. Go to the **Zugänge** tab.
3. Create one token per person (Maik, Mattes, Bene, Torben, Benni, Tobi, …)
   and send each person *their own* token privately (messenger of choice).
   A token is displayed **only once** — the server stores only a SHA-256 hash.
4. First-time setup while you're there: add the players in the **Spieler** tab
   and create the first season (Saisons section, e.g. `Saison 1 · Herbst 26`).

Each person enters their token once on the edit page; it's remembered in their
browser. From then on **every change they save is logged with their name** —
see the **Protokoll** tab (client summary plus a server-side auto-diff, e.g.
`Abende 19→20`). Tokens can be revoked any time in **Zugänge**.

## How access control works

- **Main page is genuinely read-only**: it only ever calls `GET /api/data`
  (public). All writes require `Authorization: Bearer <token>` and are enforced
  by the Worker, not by the UI.
- **Audit log**: every `PUT` appends `{who, when, summary, auto-diff, rev}`;
  the log keeps the latest 500 entries and is readable by everyone (the group
  can see who entered what — Sticheleien inklusive).
- **Conflict safety**: saves carry the revision they were based on; a stale
  save gets HTTP 409 and the edit page reloads and asks you to re-save.
- **Admin vs. member**: the `ADMIN_TOKEN` secret can additionally manage
  tokens; personal tokens can only read/write data.

### Optional hardening

- Restrict CORS to your site: uncomment in `worker/wrangler.toml`:
  ```toml
  [vars]
  ALLOW_ORIGIN = "https://kyxrem.github.io"
  ```
- Rotate the admin secret any time: `npx wrangler secret put ADMIN_TOKEN`.

## Backup

The full dataset is one JSON document:

```bash
curl https://spieleaffen.<account>.workers.dev/api/data > backup.json
```

## Local development

```bash
cd spieleaffen/worker && npx wrangler dev   # API on http://localhost:8787
```

Point `config.js` at `http://localhost:8787` and open `spieleaffen/index.html`
via any static server.

## Scoring rules (baked into `core.js`)

- Placement per game: **1st = 5, 2nd = 3, 3rd = 1** (ties share the place)
- Showing up: **+1 per evening**
- Best score prediction per game (“Tipp”): **+3** for whoever lands closest
- Evening winner = most points that evening; streaks, Rote Laterne,
  achievements and records all derive from the recorded results.
