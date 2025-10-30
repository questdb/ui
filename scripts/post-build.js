const fs = require("fs")
const path = require("path")
const monacoConfig = require("../monaco.config")

const removeLine = (filePath) => {
  // only interested in css and javascript files. Other files, like images or fonts are ignored
  if (filePath.endsWith(".js") || filePath.endsWith(".css")) {
    const content = fs.readFileSync(filePath, "utf8").split("\n")
    const contentWithoutSourceMap = content
      .filter((line) => !line.startsWith("//# sourceMappingURL="))
      .join("\n")
    fs.writeFileSync(filePath, contentWithoutSourceMap, "utf8")
  }
}

const isFile = (filePath) => {
  const lstat = fs.lstatSync(filePath)
  return lstat.isFile()
}

const distPath = path.join(__dirname, "dist")

monacoConfig.assetCopyPatterns.forEach(({ to }) => {
  if (isFile(path.join(distPath, to))) {
    removeLine(path.join(distPath, to))
  } else {
    // if pattern in `monaco.config` points to a folder, we traverse it deeply
    const queue = fs
      .readdirSync(path.join(distPath, to))
      .map((p) => path.join(distPath, to, p))

    while (queue.length) {
      const item = queue.shift()
      if (isFile(item)) {
        removeLine(item)
      } else {
        const files = fs.readdirSync(item).map((p) => path.join(item, p))
        queue.push(...files)
      }
    }
  }
})
