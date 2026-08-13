/* PreToolUse guard: vendor/cm-vim.js and vendor/peerjs.js are generated bundles.
   A hand-edit there looks like it worked and is silently destroyed on the next
   rebuild. Exit 2 blocks the tool call and shows stderr to Claude.              */
let raw = "";
process.stdin.on("data", (d) => (raw += d)).on("end", () => {
  let p = "";
  try { p = (JSON.parse(raw).tool_input || {}).file_path || ""; } catch { process.exit(0); }
  if (/vendor[\\/](cm-vim|peerjs)\.js$/i.test(p)) {
    console.error(
      "Refusing to edit a generated bundle.\n" +
      "  " + p + " is esbuild output.\n" +
      "  Edit vendor/entry.js or vendor/peer-entry.js, then run the rebuild-vendor skill."
    );
    process.exit(2);
  }
  process.exit(0);
});
