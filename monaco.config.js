const path = require("path")
const monacoPath = path.resolve(__dirname, "node_modules", "monaco-editor")
const getPath = (...p) => path.join(monacoPath, ...p)

module.exports = {
  assetCopyPatterns: [
    {
      from: getPath("min", "vs", "loader.js"),
      to: "assets/vs/loader.js",
    },
    {
      from: getPath("min", "vs", "editor", "editor.main.js"),
      to: "assets/vs/editor/editor.main.js",
    },
    {
      from: getPath("min", "vs", "editor", "editor.main.nls.js"),
      to: "assets/vs/editor/editor.main.nls.js",
    },
    {
      from: getPath("min", "vs", "editor", "editor.main.css"),
      to: "assets/vs/editor/editor.main.css",
    },
    {
      from: getPath("min", "vs", "base"),
      to: "assets/vs/base",
    },
  ],

  sourceMapCopyPatterns: [
    {
      from: getPath("min-maps", "vs", ""),
      to: "min-maps/vs",
    },
  ],
}
