# SpieleAffen — Einrichtung

Die App hat zwei Teile:

| Teil | Was | Wo | Kosten |
|---|---|---|---|
| Frontend | Statische App (`spieleaffen/`) | GitHub Pages (dieses Repo) | frei |
| Backend | `worker/worker.js` — Daten, Codes, Änderungs-Log | Cloudflare Worker + KV | freies Kontingent |

Ohne Backend läuft die App im **Demo-Modus**: alle sieben Screens funktionieren,
die Beispieldaten liegen im Browser, in der Seitenleiste steht ein rotes
**DEMO**. Nichts geht kaputt — es ist nur nichts geteilt.

---

## 1. Frontend — GitHub Pages

Branch nach `main` mergen. Da das Repo `kyxrem.github.io` heißt, liefert
GitHub Pages es von selbst aus:

**https://kyxrem.github.io/spieleaffen/**

Es gibt nur diese eine Seite. Lesen darf jeder; eintragen darf, wer seinen
eigenen vierstelligen Code hat.

---

## 2. Backend — Cloudflare Worker (einmalig, ~10 Minuten)

Du brauchst ein kostenloses Cloudflare-Konto und Node.js.

```bash
cd spieleaffen/worker

# 1. Bei Cloudflare anmelden
npx wrangler login

# 2. KV-Namespace anlegen und die ausgegebene id in wrangler.toml eintragen
npx wrangler kv namespace create SA_KV

# 3. Admin-Schlüssel setzen — lang und zufällig, und für dich behalten.
#    Damit kommst du auch rein, wenn noch kein Affe einen Code hat oder
#    sich die Runde ausgesperrt hat.
npx wrangler secret put ADMIN_TOKEN

# 4. Hochladen — gibt deine API-URL aus, z. B. https://spieleaffen.<konto>.workers.dev
npx wrangler deploy
```

### Frontend mit dem Backend verbinden

`spieleaffen/config.js` bearbeiten:

```js
window.SPIELEAFFEN_CONFIG = {
  apiBase: 'https://spieleaffen.<konto>.workers.dev'
};
```

Committen und pushen. Aus dem roten **DEMO** wird ein grünes **LIVE**.

---

## 3. Erste Einrichtung

1. `…/spieleaffen/#admin` öffnen und den **ADMIN_TOKEN** ins Code-Feld tippen.
   (Das Feld nimmt auch längere Eingaben als vier Ziffern — es prüft nur,
   ob am Ende etwas Bekanntes herauskommt.)
2. Unter **Affen** die Leute anlegen. Jeder bekommt eine der sechs Sitzfarben;
   die Farbe gehört ihm ab dann für immer und taucht in Avatar, Tag und Balken
   wieder auf.
3. Unter **Codes** jedem seine vier Ziffern geben und sie ihm **persönlich**
   schicken — Messenger deiner Wahl, nicht in die Gruppe.
4. Mindestens einer sollte den Admin-Haken bekommen (Schild-Symbol in der
   Affen-Liste), damit nicht nur der ADMIN_TOKEN korrigieren kann.
5. Saisons und Spiele anlegen — beides steht im Datendokument und lässt sich
   über die App pflegen.

Ab jetzt trägt jeder mit seinem eigenen Code ein, und **jede Änderung steht
mit Namen im Änderungs-Log**, das alle sehen können.

---

## Wie der Zugang funktioniert

- **Lesen ist öffentlich.** `GET /api/data` und `GET /api/log` brauchen nichts.
  Das ist Absicht: der Sinn des Logs ist, dass die Runde sieht, wer was
  geändert hat.
- **Schreiben braucht eine Sitzung.** Der Code wandert genau einmal über die
  Leitung und wird gegen ein Sitzungs-Token getauscht (30 Tage gültig).
- **Gespeichert wird nie ein Code**, sondern PBKDF2-SHA256 mit 100.000 Runden
  und eigenem Salt je Affe.
- **Geraten wird nicht:** nach sechs falschen Codes ist die IP für 15 Minuten
  draußen.
- **Konfliktsicher:** jeder Speichervorgang trägt die Revision, auf der er
  beruht. Wer auf einem veralteten Stand aufsetzt, bekommt HTTP 409 und die
  App lädt neu, statt die Änderung des anderen still zu überschreiben.
- **Adminrechte** hängen am Affen (`admin: true`), nicht an einem geteilten
  Passwort. Nur Admins setzen Codes, legen Affen an und korrigieren Ergebnisse.

### Ehrlich zur Stärke der vier Ziffern

Vier Ziffern sind zehntausend Möglichkeiten. Das ist schwach, und es soll hier
auch nichts Wertvolleres schützen als eine Punktetabelle unter Freunden. Die
Sperre nach sechs Fehlversuchen ist die eigentliche Verteidigung; das langsame
Hashen schützt für den Fall, dass die Datenbank selbst einmal abhandenkommt.

Wer mehr will: `LAENGE_MIN` in `worker/worker.js` hochsetzen und längere Codes
vergeben. Die App nimmt sie an, das Eingabefeld muss dann in
`js/screens/admin.js` auf dieselbe Länge (`length: 4`) angepasst werden.

### Optional: CORS auf die eigene Seite beschränken

In `worker/wrangler.toml` einkommentieren:

```toml
[vars]
ALLOW_ORIGIN = "https://kyxrem.github.io"
```

---

## Sicherung

Der ganze Datenbestand ist ein JSON-Dokument:

```bash
curl https://spieleaffen.<konto>.workers.dev/api/data > backup.json
```

---

## Lokal entwickeln

```bash
# Frontend
python3 -m http.server 8765      # im Repo-Wurzelverzeichnis
# → http://localhost:8765/spieleaffen/

# Backend
cd spieleaffen/worker && npx wrangler dev    # API auf http://localhost:8787
```

Dann in `config.js` `apiBase: 'http://localhost:8787'` eintragen.

---

## Tests

Beides läuft ohne Netz und ohne Cloudflare-Konto:

```bash
node spieleaffen/test-engine.js          # 47 Prüfungen der Punkteregeln
node spieleaffen/worker/test-worker.js   # 33 Prüfungen des Backends
```

`test-engine.js` prüft genau die Regeln, über die am Tisch gestritten wird:
Platzierung 5/3/1, geteilte Plätze bei Gleichstand, +1 fürs Antreten, +3 für
den besten Tipp, −20 Strafe, Abendsieger und Letzter des Abends.

`test-worker.js` fährt den Worker gegen einen KV-Ersatz im Speicher: Anmelden,
Sperre nach Fehlversuchen, Konflikt bei veralteter Revision, Rechte, und dass
kein Code je im Klartext in der Datenbank landet.

---

## Punkteregeln (in `js/engine.js`)

- Platzierung je Spiel: **1. = 5, 2. = 3, 3. = 1** (Gleichstand teilt den Platz)
- Antreten: **+1 pro Abend** (einmal, nicht pro Spiel)
- Bester Tipp je Spiel: **+3** für die kleinste Abweichung; bei Gleichstand
  bekommen alle Nächsten den Bonus
- Strafe: **−20** je Regelbruch
- Abendsieger = meiste Punkte des Abends; Letzter nur, wenn er eindeutig ist

Pokale, Rekorde, Serien und Angstgegner werden aus der Historie berechnet —
nichts davon wird gespeichert, alles ergibt sich aus den eingetragenen Abenden.
