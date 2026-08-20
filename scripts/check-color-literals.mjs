import { readdir, readFile } from "node:fs/promises"
import { extname, join, relative, sep } from "node:path"

const root = process.cwd()
const sourceRoot = join(root, "src")
const supportedExtensions = new Set([
  ".css",
  ".js",
  ".jsx",
  ".scss",
  ".ts",
  ".tsx",
])
const ignoredDirectories = new Set(["__tests__"])
const paletteFile = join("src", "theme", "index.ts")
const fixedBrandAssets = new Set([
  join("src", "providers", "SettingsProvider", "QuestDBLogo.tsx"),
])

const literalPattern =
  /(?<!&)#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})\b|\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\s*\(/gi
const namedColors =
  "aqua|black|blue|brown|coral|crimson|cyan|fuchsia|gold|gray|grey|green|indigo|lime|magenta|maroon|navy|olive|orange|pink|purple|red|salmon|silver|teal|tomato|turquoise|violet|white|yellow"
const namedColorPattern = new RegExp(
  `(?:^|[;{])\\s*(?:background(?:-color)?|border(?:-[\\w-]+)?-color|color|fill|stroke)\\s*:\\s*(?:${namedColors})\\b`,
  "gi",
)
const quotedNamedColorPattern = new RegExp(
  `\\b(?:background(?:Color)?|borderColor|color|fill|stroke)\\s*[:=]\\s*(["'])(?:${namedColors})\\1`,
  "gi",
)

const toProjectPath = (file) => relative(root, file).split(sep).join("/")

const collectFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        return ignoredDirectories.has(entry.name) ? [] : collectFiles(path)
      }
      const isTest = /\.(?:spec|test)\.[^.]+$/.test(entry.name)
      return supportedExtensions.has(extname(entry.name)) && !isTest
        ? [path]
        : []
    }),
  )
  return nested.flat()
}

const removeDynamicColorFunctions = (line) =>
  line.replace(/(?:rgb|rgba|hsl|hsla)\s*\([^)]*\$\{[^)]*\)/gi, "")

const files = await collectFiles(sourceRoot)
const violations = []

for (const file of files) {
  const projectPath = toProjectPath(file)
  if (projectPath === paletteFile || fixedBrandAssets.has(projectPath)) continue

  const lines = (await readFile(file, "utf8")).split(/\r?\n/)
  lines.forEach((line, index) => {
    const candidate = removeDynamicColorFunctions(line)
    const matches = [
      ...candidate.matchAll(literalPattern),
      ...candidate.matchAll(namedColorPattern),
      ...candidate.matchAll(quotedNamedColorPattern),
    ]
    for (const match of matches) {
      violations.push(`${projectPath}:${index + 1}: ${match[0].trim()}`)
    }
  })
}

if (violations.length > 0) {
  console.error(
    [
      "UI color literals must be declared in src/theme/index.ts and consumed through theme.color or the approved legacy theme bridge.",
      "Dynamic color functions containing template expressions are allowed.",
      "",
      ...violations,
    ].join("\n"),
  )
  process.exitCode = 1
} else {
  console.log(
    "Color token check passed: no UI color literals outside theme.color.",
  )
}
