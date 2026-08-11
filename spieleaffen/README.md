# SpieleAffen

Ein Dashboard für den Spieleabend. Wer war da, wer hat gewonnen, wer zahlt die
Pizza, und wer verliert gerade. Deutsch, per du, frech — und dunkel, weil am
Tisch das Licht aus ist.

Gebaut aus einem Design-System-Handoff von [Claude Design](https://claude.ai/design):
Tokens, 24 Komponenten und ein siebenschirmiges UI-Kit. Der Handoff liefert
React-Prototypen; hier steht Vanilla-JS ohne Build-Schritt, weil das Repo eine
statische GitHub-Pages-Seite ist.

**Einrichtung, Backend und Tests: siehe [DEPLOY.md](DEPLOY.md).**

## Aufbau

```
index.html        eine Seite, sieben Screens, Routing über den Hash
config.js         apiBase — leer heißt Demo-Modus
demo-data.js      deterministische Beispieldaten

css/
  tokens.css      die acht Token-Dateien des Handoffs, wortgleich
  fonts.css       Chivo · IBM Plex Sans · JetBrains Mono, selbst gehostet
  components.css  die 24 Komponenten als Klassen
  app.css         Schale, Raster, drei Haltepunkte

js/
  dom.js          Hyperscript-Helfer — das einzige „Framework"
  icons.js        Inline-SVG-Symbole (Lucide-Manier), gleiche API wie im Handoff
  components.js   die 24 Komponenten als DOM-Fabriken
  engine.js       Punkteregeln, Tabellen, Pokale, Rekorde — läuft auch in Node
  teases.js       die deterministischen Sprüche
  api.js          Worker-Client
  store.js        Zustand, Speichern, Konflikte
  shell.js        Seitenleiste, ScreenHead, Toasts, Dialog-Wirt
  dialogs.js      Abend planen · Ergebnis eintragen · Affe hinzufügen
  screens/        uebersicht abend affen rangliste spiele module admin
  main.js         Router und Start

worker/           Cloudflare Worker: Daten, Codes, Änderungs-Log
fonts/            woff2, nur latin und latin-ext (228 KB)
```

## Wie die Screens zusammenhängen

**Übersicht** ist die Startseite: Kennzahlen, der laufende Abend, letzte Abende,
Rangliste-Vorschau, Snack-Liste, Rekorde.

**Abend läuft** ist die einzige Ansicht, die während des Spielens offen bleibt:
±5 je Affe, Strafe, Runde abschließen. Punsch ist hier erlaubt, weil wirklich
etwas läuft.

**Affen** trägt Ergebnisse nach: ein Spiel, ein Datum, je Affe Punkte, Tipp und
Strafe. Daraus rechnet die Engine alles Weitere — hier wird nichts addiert.

**Rangliste** skaliert dieselben Zahlen über Saison, Monat und Ewigkeit, und
zeigt im vierten Reiter die Pokale.

**Spiele** ist das Regal. Spiele mit eigenem Werkzeug tragen ein Modul-Abzeichen.

**Spielmodule** sind ebendieses Werkzeug: Catan-Würfelstatistik gegen die
erwartete Verteilung, Wizard-Block mit Gesagt/Gemacht und Wahrheitsquote.

**Admin** ist das Code-Tor: eintragen darf, wer seinen eigenen Code hat,
korrigieren nur ein Admin — und alles davon steht mit Namen im Änderungs-Log.

## Was aus der Vorgänger-App übernommen wurde

Die Punkteregeln unverändert (5/3/1, +1 Antreten, +3 bester Tipp, −20 Strafe),
dazu Tipps, Pokale, Rekorde, Angstgegner und Saisons. Was fehlt, sind die
Emoji: das Design-System verbietet sie, deshalb tragen die Pokale jetzt Symbole.

## Abweichungen vom Handoff

Drei, alle bewusst und im Kopf der jeweiligen Datei begründet:

1. **Der Affenschlüssel ist nicht geteilt.** Im Entwurf öffnet ein Code (`4242`)
   für alle. Hier hat jeder Affe eigene vier Ziffern — dieselbe `PinInput`,
   dieselbe Frechheit, aber das Log kann sagen, *wer* etwas geändert hat.
   (`js/screens/admin.js`)
2. **Korrigiert werden Ergebnisse, nicht Endstände.** Der Entwurf lässt Punkte,
   Siege und Abende direkt überschreiben. Die rechnet die Engine aber aus den
   Abenden aus; sie zu überschreiben hieße, neben die Wahrheit eine zweite zu
   stellen — genau das soll das Log verhindern. (`js/screens/admin.js`)
3. **Symbole und Schriften liegen lokal.** Der Handoff lädt beides vom
   Google-CDN und nennt die Icon-Lösung selbst einen Notbehelf. Ohne Webfont
   stand vorher das Wort „dashboard" im Layout, wo ein Icon hingehört.
   (`js/icons.js`, `css/fonts.css`)

Dazu eine Einordnung: **Pokale** sitzen als vierter Reiter in der Rangliste
statt als achter Menüpunkt, weil das Kit sieben Navigationspunkte vorsieht und
die Seitenleiste fester Teil der Schale ist.

## Responsive

Das Design ist eine feste 1440px-Bühne. Am Tisch wird aber auf dem Telefon
eingetragen, also:

| Breite | Was passiert |
|---|---|
| ≥1100px | wie gezeichnet — Seitenleiste 232px, 32px Rand, 1180px Inhaltsbreite |
| 900–1100px | Seitenleiste fällt auf die 64px-Leiste zusammen (`--rail-w` ist im Token-Satz vorgesehen) |
| <900px | Seitenleiste wird zur Leiste am unteren Rand, Raster einspaltig |

Neue Farben, Radien oder Schriftgrößen kommen dafür keine dazu — nur Layout.
