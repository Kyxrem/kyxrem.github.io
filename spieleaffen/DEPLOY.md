# SpieleAffen — Deployment & Access Guide

A static app for your Spieleabend crew: season table, tips, trophies ("Pokale"),
and Sticheleien. Read-only for everyone; writing requires a **personal access
token per person**, so every change is logged with a name.

Live URL after deployment: **https://kyxrem.github.io/spieleaffen/**
Demo with generated sample data: **https://kyxrem.github.io/spieleaffen/?demo**

---

## 1 · Deploy (one merge, nothing else)

The app is 100% static and lives in `/spieleaffen/`. GitHub Pages already
serves this repository, so:

1. Merge this branch into `main`.
2. Wait ~1 minute for the Pages build.
3. Open https://kyxrem.github.io/spieleaffen/ — done.

Data lives in the repo itself (`spieleaffen/data/data.json`), so **deploying
changes and saving data are the same mechanism: git commits**. There is no
database and no server to run.

## 2 · How access + logging works

| Page | Who | How |
|---|---|---|
| `index.html`, `abende.html`, `pokale.html`, `spieler.html` | everyone | read-only, no login |
| `edit.html` | each friend, with **their own token** | token → SHA-256 → matched against `data/tokens.json` |
| `admin.html` | only you | your GitHub PAT; registers/blocks tokens |

`data/tokens.json` contains **only SHA-256 hashes**, never real tokens — safe
to keep in a public repo.

Every save produces **three layers of "who did what"**:

1. **Git history** — commit `SpieleAffen · Mattes: Abend 07.08. eingetragen`,
   authored as `Mattes (SpieleAffen)`. Nothing can be changed invisibly, and
   `git revert` undoes vandalism.
2. **Audit log** — an entry `{when, who, what}` inside `data.json` (capped at
   400), shown on the edit page under **Protokoll**.
3. **Commit author** in `git log` / GitHub's file history UI.

## 3 · Mode A (default): tokens are GitHub Fine-grained PATs — zero infrastructure

Each friend's "access token" is a fine-grained PAT **you create in your
account**, scoped to this one repository:

1. GitHub → Settings → Developer settings → **Fine-grained personal access
   tokens** → Generate new token.
2. Name it after the person (e.g. `spieleaffen-mattes`) — expiration your call.
3. Repository access: **Only select repositories** → `kyxrem.github.io`.
4. Permissions → Repository permissions → **Contents: Read and write**. Nothing else.
5. Open **admin.html**, sign in with *your* PAT, enter the person's name +
   paste the new token → *Registrieren*. Send the token to the person
   (it's also copied to your clipboard).

Kick someone out: block them in admin.html **and** revoke the PAT on GitHub.

> Threat model, honestly: in Mode A a token technically allows commits to the
> whole repo if someone bypasses the app. Among six friends with full git
> history + revert that's usually fine. If you want hard enforcement, use Mode B.

## 4 · Mode B (hardened, ~10 min): Cloudflare Worker

Random app tokens (`SA-XXXX-…`) that can *only* edit `data.json`; the GitHub
token stays secret on the worker.

1. [dash.cloudflare.com](https://dash.cloudflare.com) → Workers & Pages →
   **Create Worker** → replace the code with `worker/worker.js` → Deploy.
2. Worker → Settings → Variables → **Secret** `GITHUB_TOKEN` = one fine-grained
   PAT of yours (this repo only, Contents: Read and write).
3. In `spieleaffen/config.js` set:
   ```js
   mode: 'worker',
   workerUrl: 'https://spieleaffen.<your-subdomain>.workers.dev'
   ```
   and commit.
4. Tokens: admin.html → **🎲 Generieren** → Registrieren → send to the person.
   Blocking in admin.html now takes effect within a minute (worker cache),
   and there is nothing else to revoke.

Both modes share the same `tokens.json`, the same admin page and the same audit
trail — you can start with A today and switch to B by editing two lines.

## 5 · Day-to-day

- **Enter an evening:** big **+** in the tab bar → token (asked once per
  device) → date, host, who's there, per game: scores + everyone's tip on
  their own score. The preview shows the evening scoring live
  (5/3/1 placement + 1 for showing up + tip bonus; configurable under
  Verwaltung → Wertung).
- **Plan the next evening** incl. RSVP ("Bin da").
- **Achievements** (25, from 🔥 Hattrick to 🏮 Rote Laterne) and all records
  are **computed** from the data — retroactively consistent, nothing to
  maintain by hand.
- **Fix mistakes:** edit.html → Abende bearbeiten, or `git revert` the commit.

## 6 · Local preview

```bash
python3 -m http.server 8000
# http://localhost:8000/spieleaffen/?demo  (sample data)
# http://localhost:8000/spieleaffen/       (real data.json)
```
