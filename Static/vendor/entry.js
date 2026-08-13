// Bundle entry: exposes CodeMirror 6 + real vim keybindings as one global.
// Library only — all app wiring stays in index.html so it can be edited without a rebuild.
import { EditorView, keymap, lineNumbers, highlightActiveLine,
         highlightActiveLineGutter, drawSelection, rectangularSelection,
         crosshairCursor, highlightSpecialChars } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { syntaxHighlighting, HighlightStyle, bracketMatching, indentOnInput,
         indentUnit, foldGutter } from "@codemirror/language";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { closeBrackets } from "@codemirror/autocomplete";
import { tags as t } from "@lezer/highlight";
import { vim, Vim, getCM, CodeMirror } from "@replit/codemirror-vim";

const neonHighlight = HighlightStyle.define([
  { tag: t.keyword,                    color: "#ff00c8" },
  { tag: [t.controlKeyword, t.moduleKeyword], color: "#ff00c8", fontWeight: "bold" },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: "#c8d4e8" },
  { tag: [t.function(t.variableName), t.labelName], color: "#00f0ff" },
  { tag: [t.propertyName],             color: "#7ee8ff" },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: "#b026ff" },
  { tag: [t.definition(t.name), t.separator], color: "#c8d4e8" },
  { tag: [t.typeName, t.className, t.number, t.changed, t.annotation,
          t.self, t.namespace],        color: "#ffd60a" },
  { tag: [t.operator, t.operatorKeyword], color: "#ff00c8" },
  { tag: [t.string, t.special(t.string)], color: "#39ff14" },
  { tag: [t.meta, t.comment],          color: "#5a6a88", fontStyle: "italic" },
  { tag: t.invalid,                    color: "#ff4444" },
]);

const neonTheme = EditorView.theme({
  "&": { color: "#c8d4e8", backgroundColor: "transparent", fontSize: "14px" },
  ".cm-content": { caretColor: "var(--accent)", fontFamily: "inherit", padding: "10px 0" },
  ".cm-scroller": { fontFamily: "inherit", lineHeight: "1.7" },
  "&.cm-focused": { outline: "none" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
  // vim block cursor
  ".cm-fat-cursor": {
    background: "var(--accent)", color: "#04050a !important",
    boxShadow: "0 0 16px var(--accent)",
  },
  "&:not(.cm-focused) .cm-fat-cursor": { background: "none", outline: "1px solid var(--accent)" },
  ".cm-selectionBackground, ::selection": { background: "color-mix(in srgb, var(--accent) 30%, transparent) !important" },
  "&.cm-focused .cm-selectionBackground": { background: "color-mix(in srgb, var(--accent) 32%, transparent) !important" },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--accent) 7%, transparent)" },
  ".cm-gutters": {
    backgroundColor: "transparent", color: "#2f3a52", border: "none",
    borderRight: "1px solid color-mix(in srgb, var(--accent) 14%, transparent)",
  },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--accent)", textShadow: "0 0 10px var(--accent)" },
  ".cm-selectionMatch": { backgroundColor: "color-mix(in srgb, var(--accent) 18%, transparent)" },
  ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
    backgroundColor: "transparent", color: "var(--accent) !important",
    outline: "1px solid var(--accent)", textShadow: "0 0 12px var(--accent)",
  },
  // vim's :ex command line
  ".cm-vim-panel": {
    backgroundColor: "#04050a", color: "var(--accent)", fontFamily: "inherit",
    borderTop: "1px solid color-mix(in srgb, var(--accent) 45%, transparent)", padding: "4px 8px",
  },
  ".cm-vim-panel input": { color: "var(--accent)", fontFamily: "inherit" },
  ".cm-panels": { backgroundColor: "#04050a", color: "var(--accent)" },
  ".cm-searchMatch": { backgroundColor: "color-mix(in srgb, var(--n-yel, #ffd60a) 30%, transparent)", outline: "1px solid #ffd60a" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "#ffd60a", color: "#04050a" },
}, { dark: true });

// NOTE: lineNumbers() is deliberately NOT in here — the app keeps it in a
// Compartment so it can swap absolute/relative numbering at runtime.
const setup = [
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  drawSelection(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  indentUnit.of("  "),
  syntaxHighlighting(neonHighlight),
  bracketMatching(),
  closeBrackets(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  keymap.of([...defaultKeymap, ...searchKeymap, ...historyKeymap, indentWithTab]),
];

globalThis.CMV = {
  EditorView, EditorState, keymap, Compartment,
  vim, Vim, getCM, CodeMirror,
  javascript, lineNumbers,
  neonTheme, setup,
};
