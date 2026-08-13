# VIM DOJO

A neon vim-golf trainer that runs entirely in the browser. Real vim keybindings —
operators, text objects, registers, macros, marks, counts, `:` ex commands, `/` search.

14 challenges: make the buffer match the target in as few keystrokes as you can.
Clear one and the solution reveals itself — every keystroke in it is a button that
dims the cheat sheet and flies you to that command's card. <kbd>Enter</kbd> moves on
to the next challenge. Best scores are saved in `localStorage`. Plus a free-play
buffer with no target.

**Versus** is live 1v1. `CREATE LOBBY` gives you a 6-character code (and an invite link);
your opponent enters it and both sides get the byte-identical 10 puzzles, a 3-2-1 countdown,
and a live view of each other's progress. Winner is **fastest time**, keystrokes breaking ties
— gated on puzzles cleared first, so skipping everything in two seconds loses rather than wins.
`REMATCH` deals a fresh 10 over the same connection.

You host nothing: deploy the same static files. PeerJS's free public broker only introduces the
two browsers, after which match traffic is direct peer-to-peer. **This is the one feature that
makes network calls** — the rest of the app is still fully offline. Some restrictive/corporate
networks block peer-to-peer entirely and versus will fail there with an explicit error; the
single-player dojo is unaffected.

**Random runs** draw procedurally generated puzzles — fresh identifiers, line counts,
and targets every time. Pick a tier (NOVICE / ADEPT / MASTER / CHAOS) and a length
(10 puzzles, or endless). A 10-run scores total keystrokes against total par, with a
best per tier.

A run ends after the last puzzle, or whenever you hit **FINISH RUN** — the only way to
end an endless one. Either way you get a stats screen: cleared vs skipped, keystrokes
against par, efficiency, elapsed time and pace, a under/par/over verdict split, your
sharpest and roughest puzzle, and a per-puzzle table with keys, par, delta, and time.
<kbd>Enter</kbd> starts another run, <kbd>Esc</kbd> dismisses. A personal best is only
recorded for a finite run cleared in full.

35 templates across the tiers, each one dropping its payload at a random depth inside
randomly generated surrounding code — so the navigation, the line count, and the
identifiers differ every draw. Measured at 99.8% distinct documents over 500 draws.

| Tier | Templates | What it draws |
|---|---|---|
| NOVICE | 8 | one motion + one operator — `dd` `J` `yyp` `D` `x` `~` `r` `o` |
| ADEPT | 12 | text objects, counts, the dot — `daw` `ciw` `gUiw` `Ndd` `di(` `di[` `ci"` `dw` `ct,` `NJ` `N>>` |
| MASTER | 15 | ex power and multi-step edits — `:g/pat/d` `:v/pat/d` `:2,4s///g` `:2,4d` `:%norm A;` `:%s/^pre//` `:sort` `Ctrl-v I` `Ctrl-v $d` `qq…q N@q` `dG` `V>` |
| CHAOS | all 35 | every tier, mixed |

## Host it on GitHub Pages

Static files only — no build step, no server to run. Single-player makes no network calls at
all; versus mode reaches the public PeerJS broker to introduce the two players (see above).

This lives at `Static/` inside the **kyxrem.github.io** user-site repo, which publishes
from the root of `main`. So there is nothing to configure — commit and push:

```bash
git add Static && git commit -m "..." && git push origin main
```

It goes live at `https://kyxrem.github.io/Static/`. All asset paths are relative
(`vendor/cm-vim.js`), so the subdirectory needs no special handling.

## Files

| | |
|---|---|
| `index.html` | the whole app — markup, styles, and all app logic |
| `vendor/cm-vim.js` | CodeMirror 6 + `@replit/codemirror-vim`, pre-bundled (563 kB, ~170 kB gzipped) |
| `vendor/peerjs.js` | PeerJS, pre-bundled (87 kB) — WebRTC data channels for versus mode |
| `.nojekyll` | stops GitHub Pages running Jekyll over the files |

Editing `index.html` needs no toolchain — fixed challenges live in the `LEVELS` array,
each one `{name, sol, desc, start, target}`. Random-mode puzzles come from `GEN`, keyed
by tier: each entry is a function returning that same shape with randomized content.
`par` is never hand-written — it is derived as the keystroke cost of `sol`.

Every task starts in normal mode at line 1, column 1, so `sol` has to include the
motion that gets to the edit. That is deliberate: navigating there is half of vim.

`sol` is a list of `[display, cheatSheetToken?]` pairs. Omit the token and it links to
the card containing `display` itself; pass `null` and the chunk renders as literal typed
text with no link. Tokens must match a whitespace-separated entry in some card's key
list — `daw` links via `["daw","aw"]` because the sheet documents the `aw` text object.

## Rebuilding the vendor bundle

Only needed to upgrade CodeMirror or change the syntax theme. `vendor/entry.js` is
the bundle source.

```bash
npm i codemirror @replit/codemirror-vim @codemirror/lang-javascript peerjs esbuild
npx esbuild vendor/entry.js --bundle --minify --format=iife --target=es2020 --legal-comments=none --outfile=vendor/cm-vim.js
npx esbuild vendor/peer-entry.js --bundle --minify --format=iife --target=es2020 --legal-comments=none --outfile=vendor/peerjs.js
```

## Animations

The **ANIMATIONS** switch in the top bar cycles three states:

| State | What it does |
|---|---|
| **OFF** *(default)* | A real off. Canvas stopped, no particles, no full-screen messages, no motion or transitions anywhere. For learning without distraction. |
| **ON** | The normal neon design. |
| **MAX** | Overdrive — hue cycling, screen shake, tearing, confetti storm. |

Off is genuinely off, not just paused: the render loop stops drawing, `burst()`,
`shout()`, `flash()` and the keycap HUD all no-op. Nothing is lost — cleared/par
info still appears in the status bar and the banner under the buffer, and the
key feed still lists your keystrokes as text.

Full-viewport luminance flashes are capped below three per second in every mode
(WCAG 2.3.1), and `prefers-reduced-motion` neuters MAX independently.

## Keys outside vim

| | |
|---|---|
| <kbd>F6</kbd> | reset the current puzzle (never scored, vim never sees it) |
| <kbd>Enter</kbd> | next challenge once cleared; on the stats screen, run again |
| <kbd>Esc</kbd> | dismiss the stats screen (inside the buffer it is plain vim) |

Controls never take focus — mousedown's default is suppressed on every button outside
the editor, so the caret stays in the buffer for the whole session.

**ABS # / REL #** in the buffer header switches between absolute line numbers and vim's
hybrid `set nu rnu` style: the cursor's line shows its real number, every other line
shows its distance from the cursor. The target pane always numbers absolutely — it has
no cursor to be relative to.

## Notes

- **Ctrl-v** (visual block) is intercepted as paste by some browsers. **Ctrl-q** is vim's
  standard alias and works here too.
- `di{` on a multi-line block leaves `{}` in this engine, where real vim leaves `{`/`}` on
  their own lines. The challenges avoid that case.
- Honours `prefers-reduced-motion`; on touch devices the custom cursor is dropped for the
  native one.
