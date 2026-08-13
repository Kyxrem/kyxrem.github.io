---
name: verify-dojo
description: Verify VIM DOJO puzzles actually solve end-to-end by replaying each puzzle's own solution through the real vim engine in a browser. Use after any change to LEVELS, GEN, check(), loadPuzzle, setDoc, renderSolution, or the cheat-sheet cards — and before claiming a change works.
---

# Verify the dojo

Nothing in this project has unit tests. The only real proof a puzzle works is
replaying its own `sol` through the live vim engine and confirming the app counts
it as cleared. `harness.js` is that check, in one canonical copy.

## Run it

1. Serve over HTTP and open the page. **Do not test from `file://`** — the preview
   pane silently refuses to reload it, so you end up testing a stale document.
   ```
   node .claude/skills/verify-dojo/serve.js
   ```
   then open `http://127.0.0.1:8777/index.html?v=<something-unique>`.
   Change the query string every reload; the pane caches aggressively.

2. Evaluate `harness.js` in the page (read the file, pass its contents to the
   browser's JS eval tool). It returns `DOJO ready`.

3. Drive it:
   ```js
   DOJO.levels()              // all 14 hand-authored levels
   DOJO.tier('NOVICE', 40)    // endless run, 40 generated puzzles
   DOJO.tier('ADEPT', 40)
   DOJO.tier('MASTER', 40)
   DOJO.deadLinks()           // solution keys with no cheat-sheet card
   DOJO.reset()               // clear test scores from localStorage when done
   ```

## Rules that matter

- **Keep each `tier()` call ≤ ~40 puzzles.** The tool call budget is about 30
  seconds. A timeout mid-sweep leaves CodeMirror wedged in "update in progress",
  and *every* subsequent puzzle fails. That looks exactly like a real regression
  and is not one — reload before believing a mass failure.
- **`solve()` checks two things**: the text matches *and* `#tgtPane` got `.match`.
  A puzzle with `rule.noInsert` can match the text while correctly not counting.
  Only checking text would hide that.
- **Always `DOJO.reset()` at the end**, or the next session opens with every level
  ticked and bogus bests.
- A full clean sweep is currently **14/14 levels, 35/35 generator templates**.
  Anything less is a regression.

## When a generated puzzle fails

`tier()` returns a `sample` with the resulting `doc` and the expected `want` for
each failing template. Usual causes, in order of likelihood:

1. The generator randomises a value twice (e.g. calling `ri()` separately in
   `start` and `target`) so the target never matches. Compute once, use twice.
2. The solution doesn't account for the cursor starting at line 1, column 1 —
   every puzzle starts top-left and `sol` must include the motion to get there.
3. A genuine engine difference. `codemirror-vim` is not vim: `di{` on a multi-line
   block gives `{}` not `{`/`}`, and `:m` silently does nothing. Probe with a
   throwaway call before designing a puzzle around an ex command.
