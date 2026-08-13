---
name: rebuild-vendor
description: Rebuild the vendored CodeMirror/vim and PeerJS bundles in vendor/. Use only when upgrading those libraries or changing what vendor/entry.js or vendor/peer-entry.js exports — never for ordinary app work.
disable-model-invocation: true
---

# Rebuild the vendor bundles

`vendor/cm-vim.js` and `vendor/peerjs.js` are generated. Never hand-edit them —
a PreToolUse hook blocks it. Edit the entry files and rebuild.

| Output | Source | Exposes |
|---|---|---|
| `vendor/cm-vim.js` | `vendor/entry.js` | `globalThis.CMV` |
| `vendor/peerjs.js` | `vendor/peer-entry.js` | `globalThis.Peer` |

## The gotcha

esbuild resolves `node_modules` **relative to the entry file**, not the working
directory. Running it against `vendor/entry.js` while deps live elsewhere fails with:

```
X [ERROR] Could not resolve "@codemirror/view"
```

So either install deps at the project root, or copy the entry next to wherever
`node_modules` lives and build from there.

## Build

```bash
npm i codemirror @replit/codemirror-vim @codemirror/lang-javascript peerjs esbuild

npx esbuild vendor/entry.js --bundle --minify --format=iife \
  --target=es2020 --legal-comments=none --outfile=vendor/cm-vim.js

npx esbuild vendor/peer-entry.js --bundle --minify --format=iife \
  --target=es2020 --legal-comments=none --outfile=vendor/peerjs.js
```

Expected sizes: ~563 kB and ~87 kB. A wildly different size means the entry
changed shape — check what it exports before shipping.

## After rebuilding

`index.html` destructures specific names from `CMV`. If you add or rename an
export, update that destructure too:

```js
const {EditorView,EditorState,vim,Vim,getCM,CodeMirror,javascript,neonTheme,setup,
       Compartment,lineNumbers}=globalThis.CMV;
```

Note `lineNumbers()` is deliberately **not** inside `setup` — the app keeps it in a
`Compartment` so it can swap absolute/relative numbering at runtime. Putting it
back into `setup` breaks the REL # toggle.

Then run the `verify-dojo` skill. A bundle upgrade can change vim behaviour
silently; the puzzle sweep is what catches it.
